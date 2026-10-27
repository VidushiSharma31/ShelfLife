CREATE UNIQUE INDEX "Shelf_ownerId_id_key"
ON "Shelf"("ownerId", "id");

ALTER TABLE "ReadingEntry"
DROP CONSTRAINT "ReadingEntry_shelfId_fkey";

ALTER TABLE "ReadingEntry"
ADD CONSTRAINT "ReadingEntry_ownerId_shelfId_fkey"
FOREIGN KEY ("ownerId", "shelfId")
REFERENCES "Shelf"("ownerId", "id")
ON DELETE CASCADE
ON UPDATE CASCADE;
