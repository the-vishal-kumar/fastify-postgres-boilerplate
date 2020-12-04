## Nodejs boilerplate


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
            git clone https://github.com/uCreateit/fastify-postgres-boilerplate.git

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

**Note**: **Before runnning below please make sure to add config variables to .env file .**


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
Open the API documentation [http://192.38.1.1:8080/api-doc](http://192.38.1.1:8080/api-doc) here.

