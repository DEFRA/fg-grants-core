# fg-grants-core

- This repo handles the infrastructure set up Entra stub, mongoDB, redis, and AWS localstack for Case Working and GAS.
- These instructions work with the following repos in the same directory as `fg-grants-core`

```shell

/
  /fg-grants-core
  /fg-gas-backend
  /fg-cw-backend
  /fg-cw-frontend
  ...
```

### If you want to run just a single case working app

- in `fg-grants-core` run `docker compose up -d`
- in one of the other repos run `~/code/fg-gas-backend > npm run dev`

### Running all case working apps

- in `fg-grants-core` run `npm run docker:up:cw`

### Running case working along with grants-ui

- in `fg-grants-core` run `npm run docker:up:grants-ui`

## Setting up

Because grants-core uses mongo replicasets and a shared mongo DB, to get things working end to end there's a little set up.

Make sure you have the latest:
- [GAS](https://github.com/DEFRA/fg-gas-backend)
- [Case working backend (CWBE)](https://github.com/DEFRA/fg-cw-backend)
- [Case working frontend (CWFE)](https://github.com/DEFRA/fg-cw-frontend)

### fg-grants-core

- `docker compose up`

### Running All other apps individually 

- copy the contents of `.env.example` to `.env`
- in GAS and cw-backend uncomment the "fg-grants-core" lines - these use the common mongoDb connection strings and other common ENV VARS
- spin up other repos e.g. `~/code/fg-gas-backend > npm run dev`
- for GAS and cw-backend the migrations scripts will run and populate the db

### Setting up user access - fg-cw-frontend and fg-cw-backend

- access the frontend and log in `http://localhost:3000`
- you probably won't see much - this sign in creates the user in the DB but we still need to add roles to the user so they can see and administer cases
  - username: `readerwriter@t.gov.uk`
  - password: `pass`
- in `fg-cw-backend` update the user roles; run `node scripts/set-user-roles.js`
- this script sets roles for the readerwriter user - you can update the script to add roles for other users as you require. The script has a map to users - add to this map to edit other users. You can get the idpId from the fg-cw-backend db users collection once you have signed in with that user.

```javascript
const users = {
  readerwriter: {
    idpId: "df20f4bd-d009-4bf4-b499-46e93e0f005a",
  },
};
```

### fg-gas-backend and grants-ui

- if you are planning to access the gas api via postman or similar tooling you'll need a bearer auth token.
- if you are planning to run up grants-ui - you will also need the bearer token (see below)
- create a local access token for the gas api:
  - checkout the readme on `fg-gas-backend` for instructions on [ways to mint an access token](https://github.com/DEFRA/fg-gas-backend#minting-service-access-tokens)
  - take note of the resulting access token - you can use this on Postman et-al as the Authorization bearer token.
- with `grants-ui`, you will need to add the bearer token to the `GAS_API_AUTH_TOKEN` environment variable  for `grants-ui` service in `compose/compose-override.yml`
- if running with the full docker compose set up then use the "run with manual env vars" (`MONGO_URI="mongodb://localhost:27017" MONGO_DATABASE=fg-gas-backend node scripts/mint-access-token.js`)
- if you're just running core in docker and the other apps using npm then use with an env-file (`node --env-file=.env scripts/mint-access-token.js`)
- if minting for grants-ui, you will need to stop and restart the grants-ui service.

You should now be set up and able to see and work with cases in the Casw Working Frontend