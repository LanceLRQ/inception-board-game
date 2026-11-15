-- 先按被举报账号定位，再扫描最近 24 小时的举报。
CREATE INDEX "idx_reports_target_created" ON "reports"("target_id", "created_at" DESC);
DROP INDEX "idx_reports_target";
