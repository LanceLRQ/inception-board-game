import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { logger } from './logger.js';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://icgame:icgame_dev@localhost:5432/icgame';

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function shutdownDatabase() {
  await prisma.$disconnect();
  await pool.end();
  logger.info('Database disconnected');
}
