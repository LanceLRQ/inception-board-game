-- 旧版已在提交举报时扣分，避免这些记录再次核实时重复扣。
ALTER TABLE "reports" ADD COLUMN "reputation_applied" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "reports" ALTER COLUMN "reputation_applied" SET DEFAULT false;
