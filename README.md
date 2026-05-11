# fg-grants-core

- This repo handles the infrastructure set up Entra stub, mongoDB, redis, and AWS localstack for Case Working, GAS, and Agreements services.
- It abstracts the core dependencies and runs them in docker using `compose up` commands.
- These instructions work with the Farming grants repos alongside this directory.

```
/
  /fg-grants-core
  /fg-gas-backend
  /fg-cw-backend
  /fg-cw-frontend
  /grants-ui (optional)
  /farming-grants-agreements-api (optional)
  /farming-grants-agreements-ui (optional)
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

### Option 1: Running one or more farming grants applications using `npm run`

- In GAS and cw-backend .env file uncomment the "fg-grants-core" lines - these use the common mongoDb connection strings and other common ENV VARS. **Only** use these vars if you're using this option - i.e. running up the case working apps using `npm run dev`.
- In `fg-grants-core` run `npm run docker:up`
- Spin up other repos e.g. ~/code/fg-gas-backend `npm run dev`
- For GAS and cw-backend the migrations scripts will run and populate the db
- If you're using case working frontend [set up fg-cw-frontend user access on fg-cw-backend](#setting-up-user-access)

#### Auth token for GAS via `npm run` (option 1)

- Create a local access token for the gas api:
  - if running fg-grants-core in docker and the other apps using `npm run` then in fg-gas-backend run `MONGO_URI="mongodb://localhost:27017" MONGO_DATABASE=fg-gas-backend node scripts/mint-access-token.js`
  - Checkout the readme on `fg-gas-backend` for more information on [ways to mint an access token](https://github.com/DEFRA/fg-gas-backend#minting-service-access-tokens)
  - Take note of the resulting access token and use this on Postman et-al as the Authorization bearer token.
  - You can now POST a new application to the GAS application endpoint.

### Option 2: Running all case working apps

- In `fg-grants-core` run `npm run docker:up:cw`
- For GAS and cw-backend the migrations scripts will run and populate the db
- If you're using case working frontend [set up fg-cw-frontend user access on fg-cw-backend](#setting-up-user-access)
- **In GAS and cw-backend .env file comment out the "fg-grants-core" lines**

#### Auth token for GAS via `docker compose` (option 2)

- The GAS API access token is automatically seeded on `docker compose up`. Check the `gas-seed-token` container logs for the token and hash values:
  ```
  docker logs gas-seed-token
  ```
- Use the token as the Authorization bearer token in Postman et-al to POST to the GAS application endpoint.

### Option 3: Running case working along with grants-ui

- In `fg-grants-core` run `npm run docker:up:grants-ui`
- For GAS and cw-backend the migrations scripts will run and populate the db
- If you're using case working frontend [set up fg-cw-frontend user access on fg-cw-backend](#setting-up-user-access)
- **In GAS and cw-backend .env file comment out the "fg-grants-core" lines**

#### Auth token for grants-ui (option 3)

- The GAS API access token is automatically seeded on `docker compose up` and pre-configured as `GAS_API_AUTH_TOKEN` in `compose/compose.override.yml`.
- grants-ui should be available at `http://localhost:3000`
- e.g. sign in to grants-ui with CRN 1300000069 and password "pass" then choose the second land parcel in the list when you reach the land parcel page.

### Option 4: Running the full stack with agreements

This option runs all case working apps, grants-ui, and the agreements services (`farming-grants-agreements-api` and `farming-grants-agreements-ui`).

- Check out `farming-grants-agreements-api` and `farming-grants-agreements-ui` alongside this repo (see directory structure above).
- In `fg-grants-core` run `npm run docker:up:agreements`
- The agreements services run under the `agreements` Docker Compose profile and connect to the shared localstack and MongoDB instances.
- The `fg-cw-frontend` service is automatically configured with the agreements proxy env vars (`AGREEMENTS_UI_URL`, `AGREEMENTS_JWT_SECRET`, etc.) via `compose/compose.override.yml`.
- **In GAS and cw-backend .env file comment out the "fg-grants-core" lines**

The following additional SNS topics and SQS queues are created in localstack for agreements:

| Resource | Type |
|----------|------|
| `agreement_status_updated_fifo.fifo` → `create_agreement_pdf_fifo.fifo` | topic + queue |
| `gas__sns__update_agreement_status_fifo.fifo` → `update_agreement_fifo.fifo` | topic + queue |
| `create_payment.fifo` → `gps__sqs__create_payment.fifo` | topic + queue |
| `cancel_payment.fifo` → `gps__sqs__cancel_payment.fifo` | topic + queue |
| `fcp_audit_farming_grants_agreements_api` | topic |
| `fcp_audit_farming_grants_agreements_ui` | topic |
| `fcp_audit_farming_grants_agreements_pdf` | topic |
| `fcp_audit_grants_payment_service` | topic |

### Using the `stack` helper

A `start-stack.js` script provides a shorthand for composing the right set of services without needing to remember the full `docker compose` command.

```
npm run stack [options...]
```

Available options:

| Option | Description |
|--------|-------------|
| `cw` | All Case Working applications including GAS |
| `grants-ui` | grants-ui and its dependencies |
| `agreements` | agreements-api and agreements-ui |
| `config-broker` | grants-config-broker (local build) |

Options can be combined:

```bash
npm run stack cw grants-ui
npm run stack cw grants-ui agreements
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

### Option 5: Running with grants-config-broker (local development)

Use this option when you need to work on grant configurations locally — adding new grants, updating config files, or testing the broker itself.

- Check out `grants-config-broker` alongside this repo (see directory structure above).
- In `fg-grants-core` run:
  ```bash
  npm run stack cw grants-ui config-broker
  ```
- The broker is built from your local `grants-config-broker` source and hot-reloads on file changes.
- It is available at `http://localhost:3012`.
- To add a new grant locally, create a directory under `grants-config-broker/compose/` following the `{grant-name}@{version}` format and register it in `grants-config-broker/compose/release.yml`. See the grants-config-broker README for details.

### Improvements/to-do

- pre populate the cw-backend Users collection so we no longer have to run the additional script.
