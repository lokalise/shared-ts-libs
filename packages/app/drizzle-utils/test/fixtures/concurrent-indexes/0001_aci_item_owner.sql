-- Built before drizzle-kit migrate; see applyConcurrentIndexes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_aci_item_owner" ON "aci"."aci_item" USING btree ("owner_id");
