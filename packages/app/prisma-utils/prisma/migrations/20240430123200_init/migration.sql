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

-- CreateIndex
CREATE UNIQUE INDEX "item1_id_key" ON "item1"("id");

-- CreateIndex
CREATE UNIQUE INDEX "item2_id_key" ON "item2"("id");
