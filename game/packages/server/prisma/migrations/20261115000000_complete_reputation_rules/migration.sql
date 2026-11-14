ALTER TABLE "reputation"
  ALTER COLUMN "score" SET DEFAULT 50,
  ALTER COLUMN "level" SET DEFAULT 'regular',
  ADD COLUMN "completed_matches" INTEGER NOT NULL DEFAULT 0;

-- 旧版从 1000 分起步，仅接入了举报扣分。换标尺时保留相对初始值的差额。
UPDATE "reputation"
SET "score" = LEAST(100, GREATEST(0, "score" - 950)),
    "level" = CASE WHEN "score" < 990 THEN 'low' ELSE 'regular' END,
    "decayed_at" = "updated_at";

ALTER TABLE "reputation"
  ADD CONSTRAINT "reputation_score_range" CHECK ("score" BETWEEN 0 AND 100);
