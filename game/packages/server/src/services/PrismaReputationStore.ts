import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import {
  REPUTATION_LEVEL_FLOORS,
  REPUTATION_MAX,
  REPUTATION_MIN,
  REPUTATION_RECOVERY_MS,
  computeNextScore,
  computeReputationLevel,
  type ReputationLevel,
  type ReputationRecord,
  type ReputationStore,
} from './ReputationService.js';

type ReputationPrisma = Pick<PrismaClient, 'reputation' | '$queryRaw'>;
type ReputationRow = Omit<ReputationRecord, 'level'> & { level: string };

export function createPrismaReputationStore(prisma: ReputationPrisma): ReputationStore {
  const toRecord = (row: ReputationRow): ReputationRecord => ({
    ...row,
    level: row.level as ReputationLevel,
  });
  return {
    async findMany(playerIds) {
      const rows = await prisma.reputation.findMany({
        where: { playerId: { in: [...playerIds] } },
      });
      return rows.map(toRecord);
    },
    async applyDelta(playerId, delta, initialScore, completed = 0, at = new Date()) {
      const firstScore = computeNextScore(initialScore, delta);
      const score = Prisma.sql`"reputation"."score"`;
      const recovered = Prisma.sql`LEAST(
        GREATEST(${initialScore} - ${score}, 0),
        GREATEST(FLOOR(EXTRACT(EPOCH FROM (${at}::timestamptz - "reputation"."decayed_at")) * 1000 / ${REPUTATION_RECOVERY_MS}), 0)
      )`;
      const next = Prisma.sql`LEAST(${REPUTATION_MAX}, GREATEST(${REPUTATION_MIN}, ${score} + ${recovered} + ${delta}))`;
      const completions = Prisma.sql`"reputation"."completed_matches" + EXCLUDED."completed_matches"`;
      const rows = await prisma.$queryRaw<ReputationRow[]>`
        INSERT INTO "reputation" ("player_id", "score", "level", "completed_matches", "decayed_at", "updated_at")
        VALUES (${playerId}::uuid, ${firstScore}, ${computeReputationLevel(firstScore, completed)}, ${completed}, ${at}, now())
        ON CONFLICT ("player_id") DO UPDATE SET
          "score" = ${next},
          "completed_matches" = ${completions},
          "level" = CASE
            WHEN ${next} < ${REPUTATION_LEVEL_FLOORS.regular} THEN 'low'
            WHEN ${next} >= ${REPUTATION_LEVEL_FLOORS.trusted}
              AND ${completions} >= ${REPUTATION_LEVEL_FLOORS.trustedCompletions} THEN 'trusted'
            ELSE 'regular'
          END,
          "decayed_at" = GREATEST("reputation"."decayed_at", EXCLUDED."decayed_at"),
          "updated_at" = GREATEST("reputation"."updated_at", now())
        RETURNING "player_id" AS "playerId", "score", "level", "completed_matches" AS "completedMatches",
          "decayed_at" AS "decayedAt", "updated_at" AS "updatedAt"`;
      const row = rows[0];
      if (!row) throw new Error('reputation upsert returned no row');
      return toRecord(row);
    },
  };
}
