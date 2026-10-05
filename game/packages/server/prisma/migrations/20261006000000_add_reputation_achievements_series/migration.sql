-- CreateTable
CREATE TABLE "reputation" (
    "player_id" UUID NOT NULL,
    "score" SMALLINT NOT NULL DEFAULT 1000,
    "level" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "decayed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reputation_pkey" PRIMARY KEY ("player_id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "icon_key" VARCHAR(50),
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "sort" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_achievements" (
    "player_id" UUID NOT NULL,
    "achievement_id" VARCHAR(50) NOT NULL,
    "unlocked_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_achievements_pkey" PRIMARY KEY ("player_id","achievement_id")
);

-- CreateTable
CREATE TABLE "series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "format" VARCHAR(30) NOT NULL,
    "max_players" SMALLINT NOT NULL,
    "started_at" TIMESTAMPTZ,
    "ended_at" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL DEFAULT 'upcoming',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "series_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_player_achievements_player" ON "player_achievements"("player_id");

-- CreateIndex
CREATE INDEX "idx_series_status" ON "series"("status");

-- 旧版举报去重只靠进程内存，库里可能已有同一对 (对局, 举报人, 目标) 的重复行；
-- 建唯一索引前保留最早的一条，其余删除，避免迁移失败。
DELETE FROM "reports" r
USING "reports" earlier
WHERE r."match_id" = earlier."match_id"
  AND r."reporter_id" = earlier."reporter_id"
  AND r."target_id" = earlier."target_id"
  AND (earlier."created_at", earlier."id") < (r."created_at", r."id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_reports_match_reporter_target" ON "reports"("match_id", "reporter_id", "target_id");

-- AddForeignKey
ALTER TABLE "reputation" ADD CONSTRAINT "reputation_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_achievements" ADD CONSTRAINT "player_achievements_achievement_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
