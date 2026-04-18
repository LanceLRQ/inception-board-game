import { createApp } from './app.js';
import { logger } from './infra/logger.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = createApp();

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started');
});
