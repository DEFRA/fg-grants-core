# fg-grants-core

Local infrastructure to aid development of grants services.

## Getting started - quick start

Launch infra components via Docker Compose:

```
docker compose up -d
```

Launch individual services:

```
~/code/fg-gas-backend > npm run dev
```

## Setting up

This repo handles the setting up of Entra stub, mongoDB and AWS localstack for Case Working and GAS.

Because grants-core uses replicasets and a shared DB, to get things working end to end there's a little set up.

These instructions work with the following repos in the same directory as `fg-grants-core`

```
/
  /fg-grants-core
  /fg-gas-backend
  /fg-cw-backend
  /fg-cw-frontend
  ...
```

Make sure you have the latest:
- [GAS](https://github.com/DEFRA/fg-gas-backend)
- [Case working backend (CWBE)](https://github.com/DEFRA/fg-cw-backend)
- [Case working frontend (CWFE)](https://github.com/DEFRA/fg-cw-frontend)

### fg-grants-core

- `docker compose up`

### GAS and CWBE

- copy the contents of `.env.example` to `.env`
- uncomment the "fg-grants-core" lines - these use the common mongoDb connection strings and other common ENV VARS
- spin up ALL repos `npm run dev`
- for GAS and CWBE the migrations scripts will run and populate the db

### CWFE

- access the frontend and log in `http://localhost:3000`
- you probably won't see much - this sign in creates the user in the DB but we still need to add roles to the user so they can see and administer cases
- username: readerwriter@t.gov.uk
- password: pass

### CWBE

- update the user roles `node scripts/set-user-roles.js`
- this script sets roles for the readerwriter user - you can update the script to add roles for other users as you require. The script has references to users - add to this map to edit other users.

```javascript
const users = {
  readerwriter: {
    idpId: "df20f4bd-d009-4bf4-b499-46e93e0f005a",
  },
};
```

### GAS

- create a local access token for the gas api
- remove the query string from the connection string in `scripts/mint-access-token.js`
- run `node --env-file=.env scripts/mint-access-token.js`
- take note of the resulting access token - you can use this on Postman/Insomnia as the bearer token on the Authorization header

### POST to the GAS 

- post to the GAS Application endpoint to create an Application in GAS and a resulting Case in Case Working

You should now be set up and able to see and work with cases in the CWFE UI