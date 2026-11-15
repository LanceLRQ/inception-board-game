import { createHash } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma/client.js';

export class DeviceFingerprintService {
  constructor(private readonly prisma: Pick<PrismaClient, '$executeRaw'>) {}

  async register(playerId: string, visitorId: string): Promise<void> {
    const fingerprint = createHash('sha256')
      .update(`icgame:device-fingerprint:${visitorId}`)
      .digest('hex');
    await this.prisma.$executeRaw`
      INSERT INTO "device_fingerprints" ("fingerprint", "player_id")
      VALUES (${fingerprint}, ${playerId}::uuid)
      ON CONFLICT ("fingerprint", "player_id") DO UPDATE SET
        "last_seen_at" = GREATEST("device_fingerprints"."last_seen_at", statement_timestamp()),
        "seen_count" = "device_fingerprints"."seen_count" + 1`;
  }
}
