const BullQueue = require('bull');
const Arena = require('bull-arena');
const { redisUrl } = require('../config');

const QUEUE_NAME = 'c2-queue';

const Queue = ({ name = QUEUE_NAME, url = redisUrl } = {}) =>
  new BullQueue(name, url);

const JobNames = {
  SendUserRegisterEmail: 'send-user-register-email',
};

const uiApp = Arena(
  {
    queues: [
      {
        // Name of the bull queue, this name must match up exactly with what you've defined in bull.
        name: QUEUE_NAME,

        // Hostname or queue prefix, you can put whatever you want.
        hostId: 'fastify-postgres-boilerplate-host-api',

        // Redis auth.
        url: redisUrl,
      },
    ],
  },
  {
    // Let express handle the listening.
    disableListen: true,
  },
);

module.exports = { Queue, uiApp, JobNames };
