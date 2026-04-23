# fg-grants-core

- This repo handles the infrastructure set up Entra stub, mongoDB, redis, and AWS localstack for Case Working and GAS.
- It abstracts the core dependencies and runs them in docker using `compose up` commands.
- These instructions work with the Farming grants repos ([fg-gas-backend (GAS)](https://github.com/DEFRA/fg-gas-backend), [fg-cw-backend](https://github.com/DEFRA/fg-cw-backend) and [fg-cw-frontend](https://github.com/DEFRA/fg-cw-frontend)) in the same directory.

```
/
  /fg-grants-core
  /fg-gas-backend
  /fg-cw-backend
  /fg-cw-frontend
  /grants-ui (optional)
```

### Standard set up (same for each option)

- In all cases, you need to make sure you have git pulled the latest of each app.
- Checked that your `.env.example` matches what you have in `.env` or copied over the configuration.
- Run ```shell npm install``` in each directory.

### Option 1: Running one or more farming grants applications using `npm run`

- In the app repo (~/code/fg-gas-backend) copy the contents of `.env.example` to `.env`
  - run ```shell npm install```
- In GAS and cw-backend .env file uncomment the "fg-grants-core" lines - these use the common mongoDb connection strings and other common ENV VARS
- In `fg-grants-core` run ```shell docker compose up```
- Spin up other repos e.g. ~/code/fg-gas-backend ```shell npm run dev```
- For GAS and cw-backend the migrations scripts will run and populate the db
- If you're using case working frontend [set up fg-cw-frontend user access on fg-cw-backend](#setting-up-user-access)

### Option 2: Running all case working apps

- in `fg-grants-core` run `npm run docker:up:cw`

### Option 3: Running case working along with grants-ui

- in `fg-grants-core` run `npm run docker:up:grants-ui`

### Setting up

Because grants-core uses mongo replicasets and a shared mongo DB, to get things working end to end there's a little set up.

### Setting up user access

- Access the frontend and log in `http://localhost:3100`
  - username: `readerwriter@t.gov.uk`
  - password: `pass`
- Users will have general access to the case working frontend but will need specicfic roles to administer cases so you probably won't see much - this sign in creates the user in the DB but we still need to add roles to the user.
- In `fg-cw-backend` add user roles by running ```shell node scripts/set-user-roles.js```
- This script sets roles for the `readerwriter@t.gov.uk` user.
- If you would like to use a different user you can update the script by adding users to the users map. Add to this map to edit other users. You can get the idpId from the fg-cw-backend db users collection once you have signed in with that user.

```javascript
const users = {
  readerwriter: {
    idpId: "df20f4bd-d009-4bf4-b499-46e93e0f005a",
  },
};
```

### GAS auth token

- If you are planning to access `fg-gas-backend` api via postman or similar tooling or running `grants-ui` you'll need to generate a bearer auth token.

#### GAS via `npm run`

- Create a local access token for the gas api:
  - if running core in docker and the other apps using `npm run` then `node --env-file=.env scripts/mint-access-token.js`
  - Checkout the readme on `fg-gas-backend` for more information on [ways to mint an access token](https://github.com/DEFRA/fg-gas-backend#minting-service-access-tokens)
  - Take note of the resulting access token and use this on Postman et-al as the Authorization bearer token.
  - You can now POST a new application to the GAS application endpoint.

#### GAS via `docker compose`

- 

#### grants-ui

- Use the "run with manual env vars" (`MONGO_URI="mongodb://localhost:27017" MONGO_DATABASE=fg-gas-backend node scripts/mint-access-token.js`)
- When running `grants-ui` you need to add the bearer token as `GAS_API_AUTH_TOKEN` environment variable for `grants-ui` service in `compose/compose-override.yml`
  - Stop and restart the grants-ui service.


You should now be set up and able to see and work with cases in the Casw Working Frontend