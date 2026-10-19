// Builds the folder the config broker serves grant configs from, using the
// grants-config-* repos checked out alongside this one. Nothing is fetched from
// GitHub: each grant is copied from its local working copy, at the version in
// that repo's package.json, so the stack runs whatever branch you have checked
// out.
//
// Output (compose/config-broker-local, gitignored) is the layout the broker
// reads from /home/node/config:
//
//   release.yml
//   <grant>@<version>/<service>/<file>
//
// The broker deploys each grant@version only once per database, so a grant
// whose files changed without a version bump in package.json would be ignored
// on restart. Changed content is given the next free patch version instead,
// tracked in compose/.grant-config-versions.json (gitignored). If you delete
// that file, also delete the stack's Mongo volume (docker compose down -v).
//
// Run on its own with: node compose/prepare-grant-configs.js [grant ...]

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const WORKSPACE_DIR = path.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path.resolve(__dirname, "config-broker-local");
const VERSIONS_FILE = path.resolve(__dirname, ".grant-config-versions.json");
const REPO_PREFIX = "grants-config-";
// The broker itself, not a repo of grant configs.
const EXCLUDED_REPOS = ["grants-config-broker"];

// The config repos' allowlists only list deployed environments, and grants-ui
// rejects anyone not allowlisted for the environment it runs in. Locally a
// grant gets the same access as in dev (so a restricted example such as
// example-whitelist stays restricted), or is open to all if dev isn't listed.
const DEFAULT_LOCAL_ALLOWLIST = "  allowAll: true\n";

function git(repoDir, args) {
  try {
    return execFileSync("git", ["-C", repoDir, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function describeCheckout(repoDir) {
  const branch = git(repoDir, ["branch", "--show-current"]) || "detached";
  const changes = git(repoDir, ["status", "--porcelain"])
    .split("\n")
    .filter(Boolean).length;
  return changes > 0 ? `${branch}, ${changes} uncommitted change(s)` : branch;
}

function findConfigRepos() {
  return fs
    .readdirSync(WORKSPACE_DIR, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        entry.name.startsWith(REPO_PREFIX) &&
        !EXCLUDED_REPOS.includes(entry.name),
    )
    .map((entry) => path.join(WORKSPACE_DIR, entry.name))
    .filter((repoDir) => fs.existsSync(path.join(repoDir, "configurations")))
    .map((repoDir) => ({
      name: path.basename(repoDir),
      dir: repoDir,
      version: JSON.parse(
        fs.readFileSync(path.join(repoDir, "package.json"), "utf8"),
      ).version,
      grants: fs
        .readdirSync(path.join(repoDir, "configurations"), {
          withFileTypes: true,
        })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    }));
}

function indexGrants(repos) {
  const grants = new Map();
  for (const repo of repos) {
    for (const grant of repo.grants) {
      if (grants.has(grant)) {
        throw new Error(
          `Grant "${grant}" is in both ${grants.get(grant).name} and ${repo.name}. ` +
            "Move one of the folders out of the workspace.",
        );
      }
      grants.set(grant, repo);
    }
  }
  return grants;
}

// Copies <grant>/<service>/... and skips loose files at the grant's top level
// and dotfiles (.DS_Store), which the broker would otherwise upload.
function copyGrant(sourceDir, targetDir, depth = 0) {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;

    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyGrant(source, target, depth + 1);
    } else if (depth > 0) {
      fs.mkdirSync(targetDir, { recursive: true });
      fs.copyFileSync(source, target);
      if (entry.name === "allowlist.yaml") addLocalAllowlist(target);
    }
  }
}

function addLocalAllowlist(file) {
  const allowlist = fs.readFileSync(file, "utf8");
  if (/^local:/m.test(allowlist)) return;

  // The indented lines under the top-level "dev:" key, up to the next one.
  const dev = /^dev:[ \t]*\n((?:(?:[ \t]+.*)?\n)*)/m.exec(allowlist + "\n");
  const body = dev?.[1].trim()
    ? dev[1].trimEnd() + "\n"
    : DEFAULT_LOCAL_ALLOWLIST;

  fs.writeFileSync(file, `${allowlist.trimEnd()}\n\nlocal:\n${body}`);
}

function hashDir(dir) {
  const hash = crypto.createHash("sha256");
  const files = fs
    .readdirSync(dir, { recursive: true })
    .filter((file) => fs.statSync(path.join(dir, file)).isFile())
    .sort();
  for (const file of files) {
    hash.update(file).update("\0");
    hash.update(fs.readFileSync(path.join(dir, file))).update("\0");
  }
  return hash.digest("hex");
}

function compareVersions(a, b) {
  const [pa, pb] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

function bumpPatch(version) {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${patch + 1}`;
}

// Only a missing file means a fresh start. Anything else has to stop the run:
// treating an unreadable history as empty can hand out a version Mongo
// already holds, and the broker would then skip the changed config.
function readVersions() {
  let versions;
  try {
    versions = JSON.parse(fs.readFileSync(VERSIONS_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw new Error(versionsFileError(error.message));
  }
  if (!versions || typeof versions !== "object" || Array.isArray(versions)) {
    throw new Error(versionsFileError("expected a JSON object"));
  }
  return versions;
}

function versionsFileError(reason) {
  return [
    `Could not read ${VERSIONS_FILE}: ${reason}`,
    "Fix the file, or delete it and reset the stack with",
    "docker compose -p fg-grants-core down -v",
  ].join("\n");
}

// The broker and its consumers use the highest active version of a grant, so
// the content being served must always be the highest version issued.
// `issued` maps version -> content hash for one grant. Keeps the highest
// version if its content is unchanged; otherwise uses the repo's version if
// that is above everything issued, or the next patch above the highest.
function pickVersion(issued, repoVersion, hash) {
  const highest = Object.keys(issued).sort(compareVersions).at(-1);

  if (!highest || compareVersions(repoVersion, highest) > 0) return repoVersion;
  if (issued[highest] === hash) return highest;
  return bumpPatch(highest);
}

// Empties the folder rather than replacing it: Docker keeps the bind mount on
// the original folder, so a recreated one would not be seen by a running stack.
function emptyOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const entry of fs.readdirSync(OUTPUT_DIR)) {
    fs.rmSync(path.join(OUTPUT_DIR, entry), { recursive: true, force: true });
  }
}

function writeReleaseFile(selected) {
  const releases = selected
    .map(
      ({ grant, repo, version }) =>
        `  - name: ${grant}\n` +
        `    version: ${version}\n` +
        `    notes: Local development from ${repo.name}\n` +
        `    environments:\n` +
        `      - name: local\n` +
        `        status: active\n`,
    )
    .join("");
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "release.yml"),
    `releases:\n${releases}`,
  );
}

/**
 * @param {string[]} requestedGrants grant names; empty means every local grant
 * @returns {string} the folder to mount into the config broker
 */
function prepareGrantConfigs(requestedGrants = []) {
  const repos = findConfigRepos();
  const grants = indexGrants(repos);

  if (grants.size === 0) {
    throw new Error(
      `No ${REPO_PREFIX}* repos found in ${WORKSPACE_DIR}. ` +
        "Clone the grant config repos you need alongside fg-grants-core.",
    );
  }

  const unknown = requestedGrants.filter((grant) => !grants.has(grant));
  if (unknown.length > 0) {
    throw new Error(
      `No local config repo has grant(s): ${unknown.join(", ")}.\n` +
        `Available: ${[...grants.keys()].sort().join(", ")}`,
    );
  }

  const names =
    requestedGrants.length > 0 ? requestedGrants : [...grants.keys()].sort();
  const selected = names.map((grant) => ({ grant, repo: grants.get(grant) }));

  const versions = readVersions();
  emptyOutputDir();
  for (const entry of selected) {
    const { grant, repo } = entry;
    const staging = path.join(OUTPUT_DIR, `.${grant}`);
    copyGrant(path.join(repo.dir, "configurations", grant), staging);

    const hash = hashDir(staging);
    versions[grant] ??= {};
    entry.version = pickVersion(versions[grant], repo.version, hash);
    versions[grant][entry.version] = hash;

    fs.renameSync(staging, path.join(OUTPUT_DIR, `${grant}@${entry.version}`));
  }
  fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versions, null, 2) + "\n");
  writeReleaseFile(selected);

  console.log("Grant configs for the config broker:");
  for (const { grant, repo, version } of selected) {
    const local =
      version === repo.version
        ? ""
        : ` (repo version ${repo.version}, renumbered so the broker redeploys it)`;
    console.log(
      `  ${grant}@${version}${local}  from ${repo.name} (${describeCheckout(repo.dir)})`,
    );
  }

  return OUTPUT_DIR;
}

// For --keep-grants: reuses the folder from the last run, or builds every
// local grant when there isn't one yet.
function existingOrPrepareGrantConfigs() {
  if (fs.existsSync(path.join(OUTPUT_DIR, "release.yml"))) {
    console.log(`Keeping the grant configs in ${OUTPUT_DIR}`);
    return OUTPUT_DIR;
  }
  console.log("No grant configs from a previous run; building all of them.");
  return prepareGrantConfigs();
}

module.exports = { prepareGrantConfigs, existingOrPrepareGrantConfigs };

if (require.main === module) {
  try {
    prepareGrantConfigs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
