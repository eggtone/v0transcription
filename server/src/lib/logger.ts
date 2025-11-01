import pino from 'pino';

const pinoOptions: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || 'info',
};

const logger = pino(pinoOptions);

export default logger; 