const options = {
  cw: {
    description: "all Case Working applications including gas",
    targets: ["gas", "cw-backend", "cw-frontend"],
    profiles: []
  },
  "grants-ui" : {
    description: "grants-ui and its dependencies",
    targets: ["grants-ui", "land-grants", "config-broker"],
    profiles: ["grants-ui", "config-broker"],
  },
  agreements: {
    description: "the agreements-api and agreements-ui projects",
    targets: ["agreements-api", "agreements-ui"],
    profiles: ["agreements"],
  },
  "config-broker": {
    description: "config broker locally",
    targets: ["config-broker"],
    profiles: ["config-broker"],
  }
};


function unique(items) {
  return [...new Set(items)];
}

function processTargets(targets) {
  return unique(targets).reduce((acc, target) => {
    return acc += ` -f compose/compose.${target}.yml`;
  }, ""); 
}

function printOverrides(configs, override) {
  const returnString = configs.join("");
  if(override) return returnString + " -f compose/compose.override.yml"
  return returnString;
}

function printProfiles(configs) {
  const profiles = unique(configs).map((p) => ` --profile ${p}`)
  return profiles.join("");
}

function main() {
  const args = process.argv.slice(2);

  if(args.length <= 0) return showHelp();

  const overrides = (args.includes("cw") || args.includes("config-broker") || args.includes("grants-ui") || args.includes("agreements"));

  const configs = args.reduce((acc, arg) => {
    const app = options[arg];
    acc.overlays.push(processTargets(app.targets));
    acc.profiles = acc.profiles.concat(app.profiles);    
    return acc;
  }, {
    overlays: [],
    profiles: []
  });

  const { spawn } = require('child_process');
  const cmd = `docker compose -f compose.yml ${printOverrides(configs.overlays, overrides)}${printProfiles(configs.profiles)} up --build --watch`;

  // grants-ui expects config-broker to serve its own grant definitions + allowlists rather than ones from /grants-config-broker
  const env = { ...process.env };
  if (args.includes("grants-ui")) {
    env.CONFIG_BROKER_PACKAGES_DIR = "../grants-ui/localstack/config-broker-local";
  }
  // when the real gas backend is running alongside grants-ui, grants with
  // %ENVIRONMENT%-templated action URLs need somewhere local to resolve to
  if (args.includes("cw") && args.includes("grants-ui")) {
    env.MOCKSERVER_INIT_PATH = "/config/*.json";
  }

  console.log(`running ${cmd}`)
  // Actually run the docker compose command
  const child = spawn(cmd, { stdio: 'inherit', shell: true, env });

  child.on('close', (code) => {
    console.log(`docker compose process exited with code ${code}`);
    process.exit(code);
  });
};

function showHelp() {
  console.log(`
    ***************** HELP **********************
    
    Run up core apps for Case Working.
    
    You can start the core stack with other dependencies with "npm run stack [...options]"
    
    Make sure you have checked out the git repos alongside this project.
    
    Available options are ... 
    ${Object.keys(options).map(k => {
      return `\n\t - ${k} (${options[k].description})`
    }).join(``)
    }
    
    e.g. npm run stack cw grants-ui
    
    `)
}

main();
