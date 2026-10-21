# fg-grants-core

- This repo handles the infrastructure set up Entra stub, mongoDB, redis, and the AWS emulator (floci) for Case Working, GAS, and Agreements services.
- It abstracts the core dependencies and runs them in docker using `compose up` commands.
- These instructions work with the Farming grants repos alongside this directory.

```
/
  /fg-grants-core
  /fg-gas-backend
  /fg-cw-backend
  /fg-cw-frontend
  /fg-grants-platform-admin
  /grants-ui (optional)
  /farming-grants-agreements-api (optional)
  /farming-grants-agreements-ui (optional)
  /fg-gss-pmf (optional)
  /grants-config-broker (optional, only to build the broker locally)
  /grants-config-example-grants (grant configs, including pigs-might-fly; see below)
  /grants-config-woodland (grant configs, optional)
  /grants-config-* (any other grant config repos, optional)
```

### Standard set up (same for each option)

- In all cases, you need to make sure you have git pulled the latest of each app.
- Checked that your `.env.example` matches what you have in `.env` or copied over the configuration.
- Run in each directory.

```
nvm use
npm install
``` 

### Quick start

The preferred method for starting the services.

`start-stack.js` script provides a shorthand for composing the right set of services without needing to remember the full `docker compose` command.

```
npm run stack [options...]
```

Available options:

| Option | Description |
|--------|-------------|
| `cw` | All Case Working applications including GAS and the grants platform admin app |
| `grants-ui` | grants-ui and its dependencies (needs `cw`) |
| `agreements` | agreements-api and agreements-ui |
| `gss-pmf` | Pigs Might Fly grant funding calculator |
| `config-broker` | grants-config-broker (local build) |

Options can be combined:

```bash
npm run stack cw grants-ui
npm run stack cw grants-ui agreements
npm run stack cw grants-ui agreements gss-pmf
npm run stack cw grants-ui config-broker
```

Flags:

| Flag | Description |
|------|-------------|
| `--grants=<grant,...>` | Only load these grant configs (default: every local grant). Also `GRANTS=...` |
| `--keep-grants` | Reuse the grant configs from the last run instead of rebuilding. Also `KEEP_GRANTS=1` |

```bash
npm run stack cw grants-ui --grants=woodland
```

See [Grant configs](#grant-configs) for details. Run `npm run stack` with no
arguments to see the help output.

### Grant configs

Every stack runs the config broker (the pinned `defradigital/grants-config-broker`
image). It publishes grant configs to GAS, CW and grants-ui-backend, built
from the `grants-config-*` repos checked out alongside this one. Nothing is
downloaded from GitHub: each grant is copied from your working copy, on
whatever branch it is on, at the version in that repo's `package.json`.
`grants-config-example-grants` holds pigs-might-fly and the example grants.

By default every local grant is used. To run with only the grants you are
working on:

```bash
npm run stack cw --grants=woodland
npm run stack cw grants-ui --grants=woodland,pigs-might-fly
GRANTS=woodland npm run stack cw
```

`--grants woodland pigs-might-fly` (with spaces) also works, but prefer `=`:
npm swallows the flag itself, so the script has to treat every argument that
isn't a stack option as a grant name.

`--grants` only limits what the broker publishes on this run. Grants deployed
on earlier runs stay in Mongo, so GAS and grants-ui still see them until you
remove the volume with `docker compose down -v`.

The configs are written to `compose/config-broker-local/` (gitignored) and
rebuilt on every run, so changes in your config repos are picked up on
restart. To reuse the configs from the last run instead, add `--keep-grants`
(or set `KEEP_GRANTS=1`). To rebuild them without starting the stack, run
`node compose/prepare-grant-configs.js [grant ...]`.

- **Allowlists:** each gets a `local` entry copied from its `dev` entry, so a
  grant has the same access locally as in dev.
- **Versions:** the broker deploys each `grant@version` only once per
  database. When a grant's files change without a version bump, it is given
  the next patch version locally (for example `woodland@1.44.2` while the repo
  says `1.44.1`), so the change is deployed and becomes the version in use.
  Issued versions are tracked in `compose/.grant-config-versions.json`. If you
  delete that file, also remove the Mongo volume (`docker compose down -v`).
- **`config-broker` option:** builds the broker from `../grants-config-broker`
  instead of using the pinned image, for working on the broker itself.


### Infrastructure drift warning

Each fg-* repo keeps its own `compose.yml` so it can run on its own, and its
integration tests use it. With the `cw` option, `npm run stack` compares those
files with this repo before starting. It prints a warning when an
infrastructure image (mongo, floci, the Entra stub, redis) has a different tag
or `wait-for-replicaset.sh` differs from `compose/wait-for-replicaset.sh`. The
full stack always uses this repo's versions, so the warning is about running a
repo on its own. It never stops the stack, because a repo on a feature branch
may differ on purpose. To check without starting anything:

```bash
node compose/check-drift.js fg-gas-backend fg-cw-backend fg-cw-frontend fg-grants-platform-admin
```

### Setting up user access

- Access the frontend and log in `http://localhost:3100`
  - username: `readerwriter@t.gov.uk`
  - password: `pass`
- Users will have general access to the case working frontend but will need specicfic roles to administer cases so you probably won't see much - this sign in creates the user in the DB but we still need to add roles to the user.
- In `fg-cw-backend` add user roles by running ```node scripts/set-user-roles.js```
- You should get a response like 
```
Setting user roles.
User roles set.
Setting user roles end.
```
- This script sets roles for the `readerwriter@t.gov.uk` user.
- If you would like to use a different user you can update the script by adding users to the users map. Add to this map to edit other users. You can get the idpId from the fg-cw-backend db users collection once you have signed in with that user.

```javascript
const users = {
  readerwriter: {
    idpId: "df20f4bd-d009-4bf4-b499-46e93e0f005a",
  },
};
```

You should now be set up and able to see and work with cases in the Case Working Frontend and Grants-ui


### Running the full stack

If you're running the full stack there are still some caveats that you need to be aware of

- See Auth token for grants-ui (option 3) for login details to grants-ui
- Once you have submitted the application, log in to case working frontend - http://localhost:3100 (see Setting up user access)
- Once you have a generated agreement you'll need to run ```node scripts/fix-local-agreements-url.js``` in fg-cw-backend to update the agreements-ui endpoint for local development if you want to view the agreement as a case-worker would. This is because the endpoint is hardcoded into the workflow definition for each env so points to a non-local environment.



### AWS emulation (floci)

SQS, SNS and S3 are emulated by [floci](https://floci.io) on `localhost:4566`,
replacing LocalStack. The whole stack now uses the same emulator as the
agreements services.

Queues, topics and subscriptions are created by init scripts mounted into the
`floci` container. They run in lexical order **by filename**, pooled across every
repo that mounts one in:

| Script | Mounted by |
|--------|------------|
| `10-core-resources.sh` | this repo (`compose/floci/ready.d/`) — resources for the non-fg services (agreements, payments, audit, config broker) |
| `20-gas-resources.sh` | `fg-gas-backend`'s own setup script, with the `cw` option |
| `21-cw-resources.sh` | `fg-cw-backend`'s own setup script, with the `cw` option |
| `50-config-broker.sh` | `grants-config-broker`, only with the `config-broker` option (local build) |
| `99-ready.sh` | this repo — writes the `/tmp/FG_GRANTS_CORE_READY` marker |

Each fg backend creates its own queues and topics, so a new queue goes in that
backend's `compose/floci/start.d/10-setup-resources.sh`, not here. Several
scripts create the same queue or topic (for example a GAS topic feeding a CW
queue), so they must use the same attributes: floci refuses a queue created
again with different attributes, and silently keeps the first attributes for a
topic.

The container's healthcheck waits on `/tmp/FG_GRANTS_CORE_READY` rather than on
the gateway responding, because floci starts serving HTTP before the init
scripts have finished. Services that `depends_on` floci with
`condition: service_healthy` therefore never start before their queues exist.
The marker has its own name because grants-ui's `start.d` scripts write
`/tmp/READY`, and floci runs every `start.d` script before any `ready.d` one. If
you add a script, give it a numeric prefix below `99`.

SNS and SQS are in-memory: every `compose up` recreates the queues and topics
from scratch. S3 is kept on the `floci-data` volume, so it lives as long as the
Mongo data does. The config broker records the grant versions it has uploaded
in Mongo and won't upload them again, so the two must be cleared together:
`docker compose down -v` removes both. If you remove one volume by hand, remove
the other too.

#### Inspecting queues and topics

The compat image ships the AWS CLI, so the quickest route needs nothing
installed on the host:

```bash
docker compose exec floci awslocal sqs list-queues
docker compose exec floci awslocal sns list-topics
docker compose exec floci awslocal sqs receive-message \
  --queue-url $(docker compose exec -T floci awslocal sqs get-queue-url \
    --queue-name gas__sqs__update_status_fifo.fifo --output text)
```

Note that queues dead-letter after a single failed receive by default, so
peeking at a queue can consume the message. Set `MAX_READS=2` in
`compose/aws.env` and recreate the stack if you need headroom.

### Improvements/to-do

- pre populate the cw-backend Users collection so we no longer have to run the additional script.
