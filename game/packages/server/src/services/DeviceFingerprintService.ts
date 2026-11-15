import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { logger } from '../infra/logger.js';

const LINKED_ACCOUNT_THRESHOLD = 4;

export class DeviceFingerprintService {
  constructor(private readonly prisma: Pick<PrismaClient, '$queryRaw' | 'deviceFingerprint'>) {}

  async register(playerId: string, visitorId: string): Promise<void> {
    const fingerprint = createHash('sha256')
      .update(`icgame:device-fingerprint:${visitorId}`)
      .digest('hex');
    const [row] = await this.prisma.$queryRaw<{ seenCount: number }[]>`
      INSERT INTO "device_fingerprints" ("fingerprint", "player_id")
      VALUES (${fingerprint}, ${playerId}::uuid)
      ON CONFLICT ("fingerprint", "player_id") DO UPDATE SET
        "last_seen_at" = GREATEST("device_fingerprints"."last_seen_at", statement_timestamp()),
        "seen_count" = "device_fingerprints"."seen_count" + 1
      RETURNING "seen_count" AS "seenCount"`;
    if (row?.seenCount !== 1) return;

    const linkedAccounts = await this.prisma.deviceFingerprint.count({ where: { fingerprint } });
    if (linkedAccounts >= LINKED_ACCOUNT_THRESHOLD) {
      logger.warn(
        { playerId, linkedAccounts },
        'device fingerprint associated with multiple accounts',
      );
    }
  }

  async linkedToActiveBans(playerIds: readonly string[]): Promise<Set<string>> {
    if (playerIds.length === 0) return new Set();

    const ids = Prisma.join(playerIds.map((id) => Prisma.sql`${id}::uuid`));
    const rows = await this.prisma.$queryRaw<{ playerId: string }[]>`
      SELECT DISTINCT own."player_id" AS "playerId"
      FROM "device_fingerprints" own
      WHERE own."player_id" IN (${ids})
        AND EXISTS (
          SELECT 1
          FROM "device_fingerprints" peer
          JOIN "players" p ON p."id" = peer."player_id"
          WHERE peer."fingerprint" = own."fingerprint"
            AND peer."player_id" <> own."player_id"
            AND p."is_banned"
            AND (p."ban_until" IS NULL OR p."ban_until" > statement_timestamp())
        )`;
    return new Set(rows.map(({ playerId }) => playerId));
  }
}
