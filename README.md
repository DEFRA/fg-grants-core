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

- In fg-gas-backend first make sure you have the fg-grants-core lines commented out in your .env
- Then run `node --env-file=.env  scripts/mint-access-token.js`
- Take note of the resulting access token and use this on Postman et-al as the Authorization bearer token.
- You can now POST a new application to the GAS application endpoint.

### Option 3: Running case working along with grants-ui

- In `fg-grants-core` run `npm run docker:up:grants-ui`
- For GAS and cw-backend the migrations scripts will run and populate the db
- If you're using case working frontend [set up fg-cw-frontend user access on fg-cw-backend](#setting-up-user-access)
- **In GAS and cw-backend .env file comment out the "fg-grants-core" lines**

#### Auth token for grants-ui (option 3)

- Make sure mongo is running ... `npm run docker:up:grants-ui`
- In fg-gas-backend run `node --env-file=.env  scripts/mint-access-token.js`
- When running `grants-ui` you need to add the bearer token as `GAS_API_AUTH_TOKEN` environment variable for `grants-ui` service in `compose/compose-override.yml`
  - In Docker, stop the containers and remove grants-ui then restart using `npm run docker:up:grants-ui` to rebuild grants-ui.
- grants-ui should be available at `http://localhost:3000`
- e.g. sign in to grants-ui with CRN 1300000069 and password "pass" then choose the second land parcel in the list when you reach the land parcel page.

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

### Improvements/to-do

- pre mint the gas token and store in an env file that grants-ui can pick up on build.
- pre populate the cw-backend Users collection so we no longer have to run the additional script.
