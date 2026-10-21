// Warns when a sibling fg-* repo's own compose.yml runs different
// infrastructure from this repo. Each fg-* repo keeps a compose.yml so it can
// run on its own (its integration tests use it), and fg-grants-core holds the
// versions the full stack runs. CI in those repos can't see this one, so the
// comparison happens here, before the stack starts. It only warns: a repo on a
// feature branch may differ on purpose.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CORE_DIR = path.resolve(__dirname, "..");
const WORKSPACE_DIR = path.resolve(CORE_DIR, "..");
const CORE_WAIT_SCRIPT = path.join(CORE_DIR, "compose/wait-for-replicaset.sh");
// Where the repos keep their copy of the replica set wait script.
const WAIT_SCRIPT_PATHS = [
  "scripts/wait-for-replicaset.sh",
  "compose/wait-for-replicaset.sh",
];

// image name -> tag for every `image:` line in a compose file. Good enough for
// the plain `image: name:tag` lines these files use, without a YAML parser.
function readImages(file) {
  const images = new Map();
  if (!fs.existsSync(file)) return images;

  const pattern = /^\s*image:\s*["']?([^\s"'#]+)/gm;
  for (const [, ref] of fs.readFileSync(file, "utf8").matchAll(pattern)) {
    const at = ref.lastIndexOf(":");
    if (at <= ref.lastIndexOf("/")) {
      images.set(ref, "latest");
    } else {
      images.set(ref.slice(0, at), ref.slice(at + 1));
    }
  }
  return images;
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function findDrift(repo, coreImages, coreWaitHash) {
  const dir = path.join(WORKSPACE_DIR, repo);
  const drift = [];

  for (const [image, tag] of readImages(path.join(dir, "compose.yml"))) {
    const coreTag = coreImages.get(image);
    if (coreTag && coreTag !== tag) {
      drift.push(`compose.yml: ${image}:${tag} (fg-grants-core: ${coreTag})`);
    }
  }

  for (const relative of WAIT_SCRIPT_PATHS) {
    const file = path.join(dir, relative);
    if (fs.existsSync(file) && hashFile(file) !== coreWaitHash) {
      drift.push(`${relative} differs from fg-grants-core's`);
    }
  }

  return drift;
}

// Returns the warning lines, or an empty list when everything matches. Repos
// that aren't checked out are skipped.
function checkDrift(repos) {
  const coreImages = readImages(path.join(CORE_DIR, "compose.yml"));
  const coreWaitHash = hashFile(CORE_WAIT_SCRIPT);

  return repos
    .filter((repo) => fs.existsSync(path.join(WORKSPACE_DIR, repo)))
    .flatMap((repo) =>
      findDrift(repo, coreImages, coreWaitHash).map(
        (line) => `  ${repo} ${line}`,
      ),
    );
}

function printDriftWarning(repos) {
  const lines = checkDrift(repos);
  if (lines.length === 0) return;

  console.warn(
    [
      "Warning: these repos' own infrastructure differs from fg-grants-core.",
      "The full stack uses fg-grants-core's versions, but running a repo on its",
      "own (and its integration tests) uses the versions below:",
      ...lines,
      "",
    ].join("\n"),
  );
}

module.exports = { checkDrift, printDriftWarning };

if (require.main === module) {
  const lines = checkDrift(process.argv.slice(2));
  console.log(lines.length > 0 ? lines.join("\n") : "No drift.");
}
