const EventEmitter = require('events');
const { Queue } = require('../common/queue');
const { reportError } = require('../infra/report-error');
const { createSequelize } = require('../infra/sequelize');
const jobs = require('./jobs');

// https://github.com/OptimalBits/bull/issues/503
EventEmitter.defaultMaxListeners = 14;

(async () => {
  try {
    const sequelize = await createSequelize();
    // USE TO SEND PUSH NOTIFICATIONS IN BACKGROUND
    const pushNotificationService = {}; // TO DO: SET PUSH NOTIFICATION INSTANSE
    const queue = Queue();
    queue.on('error', reportError); // redis errors
    queue.on('failed', (job, error) => reportError(error)); // failed jobs

    const cleanUp = async () => {
      try {
        // eslint-disable-next-line no-console
        console.info('Closing');
        await Promise.all([
          sequelize.close(),
          queue.close(),
          // pushNotificationService.close(),
        ]);
        process.exit(0);
      } catch (error) {
        // eslint-disable-next-line no-console
        reportError(error);
        process.exit(1);
      }
    };
    process.on('SIGTERM', cleanUp);
    process.on('SIGINT', cleanUp);

    // start listening
    jobs({ sequelize, pushNotificationService }).forEach(({ name, handler }) =>
      queue.process(name, handler),
    );

    // eslint-disable-next-line no-console
    console.info('Waiting for jobs to process');
  } catch (error) {
    reportError(error);
    process.exit(1);
  }
})();
