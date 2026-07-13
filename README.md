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

### Quick start

The preferred method for starting the services.

`start-stack.js` script provides a shorthand for composing the right set of services without needing to remember the full `docker compose` command.

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



### Improvements/to-do

- pre populate the cw-backend Users collection so we no longer have to run the additional script.
- check the agreements sqs/sns topics all work as expected. Agreements uses floci and the rest of the stack uses localstack so there may be some fine tuning required in porting over.
