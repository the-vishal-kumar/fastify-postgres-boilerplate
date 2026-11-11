> **Archived (2020).** A Fastify and PostgreSQL boilerplate from December 2020, early in my career. It is kept as a record of where I started. It is not maintained, its dependencies are out of date, and it should not be deployed as-is. For how I structure a Node.js API today, see [nodejs-typescript-rest-boilerplate](https://github.com/the-vishal-kumar/nodejs-typescript-rest-boilerplate).

# fastify-postgres-boilerplate


## Security note

Read this before copying any of the code.

- **No authentication.** The user routes are public. `acl-authorization.js` and `with-session.js` exist but no route uses them.
- **Development wipes the database.** With `NODE_ENV=development` the app runs `sequelize.sync({ force: true })` on start, which drops and recreates all tables.
- **Public IP range for the Docker network.** `docker-compose.yml` uses `192.38.0.0/16`, which is public address space, not a private range. While the stack runs, traffic to real hosts in that range goes to the containers instead.
- **Public Cloud Run service.** `cloudbuild.yaml` deploys with `--allow-unauthenticated`.

Fixed during archiving:

- The rate limiter built its SQL by string interpolation of the client address. A single quote in `X-Forwarded-For` broke the query, so the limiter recorded nothing and let every request through. It now uses bound parameters.
- Seed data contained real people's work email addresses. They are replaced with `example.com` addresses.
- The database password was hard-coded in `docker-compose.yml`. It now comes from `POSTGRES_PASSWORD`, defaulting to `postgres` for local use.
- The GitHub Actions workflow failed on every push and targeted services this repo does not own. It is removed.

## Known issues

- `GET /users/getUserByEmail` validates the `email` query parameter but never passes it on, so every call returns 500.
- The rate limit table uses `Source` alone as its primary key, so one client address can only hold a counter for one route at a time.

## What I'd do differently today

- **Migrations, never `sync`.** Schema changes go through reviewed migrations; nothing drops tables on start.
- **Authentication and authorisation wired in from the first route,** not left as unused helpers.
- **Response schemas as well as request schemas.** Fastify can serialise and validate responses from JSON Schema, which also keeps fields like password hashes from leaking.
- **Rate limiting in Redis or at the edge,** not with a read-then-write in PostgreSQL on every request, which races under concurrency.
- **Secrets from a secrets manager,** with the app refusing to start when one is missing.
- **Docker that builds once and runs anywhere:** a multi-stage build, a non-root user, a health check, and services found by name instead of fixed IPs.
- **Tests in CI on every pull request,** with Testcontainers for PostgreSQL and Redis, and a deploy step that only runs from the main branch.
- **Observability with OpenTelemetry,** not a vendor agent: traces, request metrics and structured logs with request IDs.

## Technologies

- Language: Node.js
- Framework: Fastify
- Database: PostgreSQL

#### Basic Requirements

- Node (12.x.x)
- PostgreSQL 12.x (We are using latest version in docker)
- docker and docker-compose
- Git

## How to install project on local machine
  
    Open CLI and run following commands to set up at local:
   - **Clone of the project**
        >
            git clone https://github.com/the-vishal-kumar/fastify-postgres-boilerplate.git

   - **Go to a project directory**
       > 
            cd fastify-postgres-boilerplate

   - **Following commands executes the Dockerfile, and does some other magic**
       >
            docker-compose up --build

  - **Now take down the running container (we wanted to run it once for now) - in a different tab (or do ```CTRL + C``` to take these down).**
       >
        docker-compose down

  - **Install the node dependencies**
       >
        docker-compose run web npm install
  

# Post Installation steps

**Note**: before running the steps below, copy `.env.sample` to `.env` and fill in the values.


 - **Run database migrations**
    >
        docker-compose run web node_modules/.bin/sequelize db:migrate


 - **Run seeder**
    >
        docker-compose run web node_modules/.bin/sequelize db:seed:all

 - **Start the application**
    >
        docker-compose run web npm start

As IP is configured in ```docker-compose.yml``` file so APP will be running on 192.38.1.1:8080. 
Swagger UI is served at `http://192.38.1.1:8080/documentation`.
