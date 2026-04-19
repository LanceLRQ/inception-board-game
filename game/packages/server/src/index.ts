import { createServer } from 'node:http';
import { createApp } from './app.js';
import { logger } from './infra/logger.js';
import { ConnectionRegistry } from './ws/connectionRegistry.js';
import { HeartbeatManager } from './ws/heartbeat.js';
import { ReconnectManager } from './ws/reconnect.js';
import { WSMessageRouter } from './ws/messageRouter.js';
import { SocketGateway } from './ws/gateway.js';
import { BotManager } from './services/BotManager.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const app = createApp();
const httpServer = createServer(app.callback());

// WS 基础组件
const registry = new ConnectionRegistry();
const heartbeat = new HeartbeatManager();
const reconnect = new ReconnectManager();
const bot = new BotManager();
const router = new WSMessageRouter({ heartbeat, reconnect, bot });
const gateway = new SocketGateway(
  { registry, router, bot, heartbeat },
  { corsOrigin: process.env.WS_CORS_ORIGIN ?? '*', path: process.env.WS_PATH ?? '/ws' },
);

gateway.attach(httpServer);
bot.start();

httpServer.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started (HTTP + WS)');
});

const shutdown = (signal: string) => {
  logger.info({ signal }, 'Shutting down');
  bot.stop();
  gateway.detach();
  httpServer.close(() => process.exit(0));
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
