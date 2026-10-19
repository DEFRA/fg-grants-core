const {
  prepareGrantConfigs,
  existingOrPrepareGrantConfigs,
} = require("./prepare-grant-configs");

// The config broker isn't an option: it runs in every stack (see
// compose.override.yml). `localTargets` are overlays added after
// compose.override.yml, so they can replace what it sets.
const options = {
  cw: {
    description: "all Case Working applications including gas",
    targets: ["gas", "cw-backend", "cw-frontend", "platform-admin"],
    profiles: [],
  },
  "grants-ui": {
    description: "grants-ui and its dependencies",
    targets: ["grants-ui", "land-grants"],
    profiles: ["grants-ui"],
  },
  agreements: {
    description: "the agreements-api and agreements-ui projects",
    targets: ["agreements-api", "agreements-ui"],
    profiles: ["agreements"],
  },
  "gss-pmf": {
    description: "the Pigs Might Fly grant funding calculator",
    targets: ["gss-pmf"],
    profiles: ["gss-pmf"],
  },
  "config-broker": {
    description: "build the config broker from ../grants-config-broker",
    targets: [],
    localTargets: ["config-broker"],
    profiles: [],
  },
};

function unique(items) {
  return [...new Set(items)];
}

function processTargets(targets) {
  return unique(targets).reduce((acc, target) => {
    return (acc += ` -f compose/compose.${target}.yml`);
  }, "");
}

function printOverrides(configs, override, localConfigs) {
  const returnString = configs.join("");
  if (override)
    return (
      returnString + " -f compose/compose.override.yml" + localConfigs.join("")
    );
  return returnString;
}

function printProfiles(configs) {
  const profiles = unique(configs).map((p) => ` --profile ${p}`);
  return profiles.join("");
}

// Splits the grant list out of the stack options. An empty list means every
// local grant config. Accepts, in order of precedence:
//   node compose/start-stack.js cw --grants a,b   (or -- after npm run stack)
//   npm run stack cw --grants=a,b                 npm keeps the flag and sets
//                                                 npm_config_grants=a,b
//   npm run stack cw --grants a,b                 npm keeps the flag, sets
//                                                 npm_config_grants=true and
//                                                 passes a,b on as an option
//   GRANTS=a,b npm run stack cw
// --keep-grants (or KEEP_GRANTS=1) skips the rebuild; npm turns the flag into
// npm_config_keep_grants.
function parseArgs(argv) {
  const args = [];
  let grants = process.env.GRANTS || "";
  const npmGrants = process.env.npm_config_grants;
  let keepGrants = Boolean(
    process.env.KEEP_GRANTS || process.env.npm_config_keep_grants,
  );

  if (npmGrants && npmGrants !== "true") grants = npmGrants;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--keep-grants") {
      keepGrants = true;
    } else if (argv[i] === "--grants") {
      grants = argv[++i] || "";
    } else if (argv[i].startsWith("--grants=")) {
      grants = argv[i].slice("--grants=".length);
    } else if (npmGrants === "true" && !options[argv[i]]) {
      grants = argv[i];
    } else {
      args.push(argv[i]);
    }
  }

  return {
    args,
    keepGrants,
    grants: grants
      .split(",")
      .map((grant) => grant.trim())
      .filter(Boolean),
  };
}

function main() {
  const { args, grants, keepGrants } = parseArgs(process.argv.slice(2));

  if (args.length <= 0) return showHelp();

  const unknown = args.filter((arg) => !options[arg]);
  if (unknown.length > 0) {
    console.error(`Unknown option(s): ${unknown.join(", ")}`);
    showHelp();
    process.exit(1);
  }

  const overrides =
    args.includes("cw") ||
    args.includes("config-broker") ||
    args.includes("grants-ui") ||
    args.includes("agreements") ||
    args.includes("gss-pmf");

  const configs = args.reduce(
    (acc, arg) => {
      const app = options[arg];
      acc.overlays.push(processTargets(app.targets));
      acc.localOverlays.push(processTargets(app.localTargets || []));
      acc.profiles = acc.profiles.concat(app.profiles);
      return acc;
    },
    {
      overlays: [],
      localOverlays: [],
      profiles: [],
    },
  );

  const { spawn } = require("child_process");
  const cmd = `docker compose -f compose.yml ${printOverrides(configs.overlays, overrides, configs.localOverlays)}${printProfiles(configs.profiles)} up --build --watch`;

  // The config broker serves grant configs built from the local
  // grants-config-* repos, rebuilt on every run unless --keep-grants is set
  const env = { ...process.env };
  try {
    if (keepGrants && grants.length > 0) {
      console.log("--grants given, so ignoring --keep-grants.");
    }
    env.CONFIG_BROKER_PACKAGES_DIR =
      keepGrants && grants.length === 0
        ? existingOrPrepareGrantConfigs()
        : prepareGrantConfigs(grants);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  // when the real gas backend is running alongside grants-ui, grants with
  // %ENVIRONMENT%-templated action URLs need somewhere local to resolve to
  if (args.includes("cw") && args.includes("grants-ui")) {
    env.MOCKSERVER_INIT_PATH = "/config/*.json";
  }

  console.log(`running ${cmd}`);
  // Actually run the docker compose command
  const child = spawn(cmd, { stdio: "inherit", shell: true, env });

  child.on("close", (code) => {
    console.log(`docker compose process exited with code ${code}`);
    process.exit(code);
  });
}

function showHelp() {
  console.log(`
    ***************** HELP **********************
    
    Run up core apps for Case Working.
    
    You can start the core stack with other dependencies with "npm run stack [...options]"
    
    Make sure you have checked out the git repos alongside this project.
    
    Available options are ... 
    ${Object.keys(options)
      .map((k) => {
        return `\n\t - ${k} (${options[k].description})`;
      })
      .join(``)}
    
    e.g. npm run stack cw grants-ui

    The config broker runs in every stack, serving grant configs from the
    grants-config-* repos alongside this one. They are rebuilt on every
    run. Choose which with --grants (or the GRANTS env var); by default
    all local grants are used. --keep-grants (or KEEP_GRANTS=1) reuses
    the configs from the last run.

    e.g. npm run stack cw --grants woodland,pigs-might-fly

    `);
}

main();
