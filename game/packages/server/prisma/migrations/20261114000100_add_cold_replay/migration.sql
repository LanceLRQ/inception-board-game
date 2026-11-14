ALTER TABLE "matches" ADD COLUMN "replay_archive_key" TEXT;
CREATE INDEX "idx_matches_cold_replay" ON "matches"("replay_archive_key", "ended_at");
