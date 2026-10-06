-- 举报面板持久化表
-- 反作弊与信誉分

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "match_id" VARCHAR(64) NOT NULL,
    "reporter_id" VARCHAR(64) NOT NULL,
    "target_id" VARCHAR(64) NOT NULL,
    "reason" VARCHAR(20) NOT NULL,
    "description" VARCHAR(500),
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,
    "resolved_by_operator_id" VARCHAR(64),
    "notes" VARCHAR(500),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_reports_status_created" ON "reports"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_reports_match" ON "reports"("match_id");

-- CreateIndex
CREATE INDEX "idx_reports_target" ON "reports"("target_id");

-- CreateIndex
CREATE INDEX "idx_reports_reporter" ON "reports"("reporter_id");

-- CreateIndex
CREATE INDEX "idx_reports_created" ON "reports"("created_at" DESC);
