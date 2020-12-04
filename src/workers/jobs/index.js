// TO DO: CREATE EMAIL SERVICE
// const { createEmailService } = require('../../services/email');
const { JobNames } = require('../../common/queue');

module.exports = () =>
  // {sequelize: { models: {TO DO: GET MODEL TO PERFORM ANY BACKGROUND TASK WITH DATABASE }},}
  [
    {
      name: JobNames.SendUserRegisterEmail,
      handler: async () =>
        // { data: { YOU WILL RECIEVE PARAMETERS HERE}}
        {
          // TO DO: CALL SEND EMAIL FUNCTION HERE
        },
    },

    // TO DO: ATTACH ANOTHER JOB
    //   {
    //     name: NAME OF THE JOB,
    //     handler: async ({ data: { } }) => {
    //     },
    //   },
  ];
