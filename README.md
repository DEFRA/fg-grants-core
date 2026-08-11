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
  /farming-grants-agreements-pdf (optional)
  /fg-gss-pmf (optional)
  /grants-config-broker (optional)
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
| `grants-ui` | grants-ui and its dependencies |
| `agreements` | agreements-api, agreements-ui and agreements-pdf |
| `gss-pmf` | Pigs Might Fly grant funding calculator |
| `config-broker` | grants-config-broker (local build) |

Options can be combined:

```bash
npm run stack cw grants-ui
npm run stack cw grants-ui agreements
npm run stack cw grants-ui agreements gss-pmf
npm run stack cw grants-ui config-broker
```

Run `npm run stack` with no arguments to see the help output.


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

When the `agreements` option is enabled, accepting an Agreement publishes its lifecycle event to the PDF service. The generated PDF is stored in Floci S3. List generated files with:

```bash
docker compose exec floci awslocal s3 ls \
  s3://farming-grants-agreements-pdf-bucket --recursive
```

Download a listed PDF by replacing `<key>`:

```bash
docker compose exec floci awslocal s3 cp \
  s3://farming-grants-agreements-pdf-bucket/<key> \
  /tmp/agreement.pdf
docker cp fg-grants-core-floci-1:/tmp/agreement.pdf ./agreement.pdf
```

### AWS emulation (floci)

SQS, SNS and S3 are emulated by [floci](https://floci.io) on `localhost:4566`,
replacing LocalStack. The whole stack now uses the same emulator as the
agreements services.

Queues, topics and subscriptions are created by init scripts mounted into the
`floci` container. They run in lexical order **by filename**, pooled across every
repo that mounts one in:

| Script | Mounted by |
|--------|------------|
| `10-core-resources.sh` | this repo (`compose/floci/ready.d/`) |
| `50-config-broker.sh` | `grants-config-broker`, only under the `config-broker` profile |
| `99-ready.sh` | this repo — writes the `/tmp/READY` marker |

The container's healthcheck waits on `/tmp/READY` rather than on the gateway
responding, because floci starts serving HTTP before the init scripts have
finished. Services that `depends_on` floci with `condition: service_healthy`
therefore never start before their queues exist. If you add a script, give it a
numeric prefix below `99`.

State is in-memory: every `compose up` recreates the resources from scratch.

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
