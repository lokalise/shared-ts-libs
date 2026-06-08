-- CreateTable
CREATE TABLE "item1" (
    "id" UUID NOT NULL DEFAULT gen_random_ulid(),
    "value" STRING NOT NULL,

    CONSTRAINT "item1_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item2" (
    "id" UUID NOT NULL DEFAULT gen_random_ulid(),
    "value" STRING NOT NULL,

    CONSTRAINT "item2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_update_item" (
    "id" UUID NOT NULL DEFAULT gen_random_ulid(),
    "group_id" UUID NOT NULL,
    "number" INT4 NOT NULL DEFAULT 0,
    "value" STRING NOT NULL,
    "count" INT4,
    "metadata" JSONB,

    CONSTRAINT "bulk_update_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "item1_id_key" ON "item1"("id");

-- CreateIndex
CREATE UNIQUE INDEX "item2_id_key" ON "item2"("id");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_update_item_group_id_number_key" ON "bulk_update_item"("group_id", "number");
