CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aci_item_owner" ON "aci"."aci_item" ("owner_id");
CREATE INDEX "idx_aci_item_code" ON "aci"."aci_item" ("code");
