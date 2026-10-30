CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_aci_item_code ON aci.aci_item (code) INCLUDE (owner_id);
--> statement-breakpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aci_missing_owner" ON "aci"."aci_missing" ("owner_id");
