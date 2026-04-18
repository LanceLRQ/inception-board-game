-- CreateTable
CREATE TABLE "players" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nickname" VARCHAR(30) NOT NULL,
    "avatar_seed" VARCHAR(64) NOT NULL,
    "avatar_palette" VARCHAR(20) NOT NULL DEFAULT 'default',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'zh-CN',
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "ban_reason" TEXT,
    "ban_until" TIMESTAMPTZ,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_codes" (
    "code_hash" VARCHAR(64) NOT NULL,
    "player_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ,

    CONSTRAINT "recovery_codes_pkey" PRIMARY KEY ("code_hash")
);

-- CreateTable
CREATE TABLE "device_fingerprints" (
    "fingerprint" VARCHAR(64) NOT NULL,
    "player_id" UUID NOT NULL,
    "first_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seen_count" INTEGER NOT NULL DEFAULT 1,
    "ip_sample" VARCHAR(45),
    "user_agent" TEXT,

    CONSTRAINT "device_fingerprints_pkey" PRIMARY KEY ("fingerprint","player_id")
);

-- CreateTable
CREATE TABLE "matches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID,
    "rule_variant" VARCHAR(20),
    "ex_enabled" BOOLEAN,
    "expansion_enabled" BOOLEAN,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ,
    "winner" VARCHAR(10),
    "win_reason" VARCHAR(100),
    "player_count" SMALLINT,
    "rng_seed" VARCHAR(64),
    "replay_compressed" BYTEA,
    "metadata" JSONB,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_players" (
    "match_id" UUID NOT NULL,
    "seat" SMALLINT NOT NULL,
    "player_id" UUID,
    "nickname" VARCHAR(50) NOT NULL,
    "is_bot" BOOLEAN NOT NULL DEFAULT false,
    "bot_level" VARCHAR(20),
    "role" VARCHAR(10) NOT NULL,
    "final_faction" VARCHAR(10) NOT NULL,
    "character_id" VARCHAR(50) NOT NULL,
    "won" BOOLEAN,
    "score" SMALLINT,
    "abandoned" BOOLEAN NOT NULL DEFAULT false,
    "ai_takeover_seconds" INTEGER NOT NULL DEFAULT 0,
    "disconnect_count" SMALLINT NOT NULL DEFAULT 0,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "is_mvp" BOOLEAN NOT NULL DEFAULT false,
    "mvp_score" DECIMAL,

    CONSTRAINT "match_players_pkey" PRIMARY KEY ("match_id","seat")
);

-- CreateTable
CREATE TABLE "match_events" (
    "id" BIGSERIAL NOT NULL,
    "match_id" UUID NOT NULL,
    "move_counter" INTEGER NOT NULL,
    "event_kind" VARCHAR(30) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_phrase_presets" (
    "id" VARCHAR(50) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "text_zh_cn" TEXT NOT NULL,
    "text_en_us" TEXT,
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "available_factions" VARCHAR(30) NOT NULL DEFAULT 'all',
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "chat_phrase_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_chat_log" (
    "id" BIGSERIAL NOT NULL,
    "match_id" UUID NOT NULL,
    "sender_player_id" UUID,
    "sender_seat" SMALLINT NOT NULL,
    "phrase_id" VARCHAR(50),
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "broadcast_to" VARCHAR(20) NOT NULL DEFAULT 'all',

    CONSTRAINT "match_chat_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "short_links" (
    "code" VARCHAR(10) NOT NULL,
    "target_type" VARCHAR(20) NOT NULL,
    "target_id" UUID NOT NULL,
    "created_by_player_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "hit_count" INTEGER NOT NULL DEFAULT 0,
    "last_hit_at" TIMESTAMPTZ,

    CONSTRAINT "short_links_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "tutorial_progress" (
    "player_id" UUID NOT NULL,
    "first_completed_at" TIMESTAMPTZ,
    "last_played_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "play_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tutorial_progress_pkey" PRIMARY KEY ("player_id")
);

-- CreateIndex
CREATE INDEX "idx_players_last_seen" ON "players"("last_seen_at");

-- CreateIndex
CREATE INDEX "idx_players_banned" ON "players"("is_banned");

-- CreateIndex
CREATE INDEX "idx_recovery_codes_player" ON "recovery_codes"("player_id");

-- CreateIndex
CREATE INDEX "idx_fp_by_fp" ON "device_fingerprints"("fingerprint");

-- CreateIndex
CREATE INDEX "idx_fp_last_seen" ON "device_fingerprints"("last_seen_at");

-- CreateIndex
CREATE INDEX "idx_matches_room" ON "matches"("room_id");

-- CreateIndex
CREATE INDEX "idx_matches_started" ON "matches"("started_at");

-- CreateIndex
CREATE INDEX "idx_match_players_player" ON "match_players"("player_id");

-- CreateIndex
CREATE INDEX "idx_match_players_abandoned" ON "match_players"("abandoned");

-- CreateIndex
CREATE INDEX "idx_match_events_time" ON "match_events"("match_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "match_events_match_id_move_counter_key" ON "match_events"("match_id", "move_counter");

-- CreateIndex
CREATE INDEX "idx_chat_log_match" ON "match_chat_log"("match_id", "sent_at");

-- CreateIndex
CREATE INDEX "idx_chat_log_sender" ON "match_chat_log"("sender_player_id", "sent_at");

-- CreateIndex
CREATE INDEX "idx_short_links_target" ON "short_links"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "idx_short_links_expires" ON "short_links"("expires_at");

-- CreateIndex
CREATE INDEX "idx_tutorial_never_completed" ON "tutorial_progress"("player_id");

-- AddForeignKey
ALTER TABLE "recovery_codes" ADD CONSTRAINT "recovery_codes_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_fingerprints" ADD CONSTRAINT "device_fingerprints_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_chat_log" ADD CONSTRAINT "match_chat_log_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_chat_log" ADD CONSTRAINT "match_chat_log_sender_player_id_fkey" FOREIGN KEY ("sender_player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_chat_log" ADD CONSTRAINT "match_chat_log_phrase_id_fkey" FOREIGN KEY ("phrase_id") REFERENCES "chat_phrase_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tutorial_progress" ADD CONSTRAINT "tutorial_progress_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
