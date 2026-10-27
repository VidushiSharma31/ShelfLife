ALTER TABLE "User"
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Book"
ADD COLUMN "authorNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "pageCount" INTEGER;

ALTER TABLE "Shelf"
ADD COLUMN "status" "ShelfStatus";

CREATE UNIQUE INDEX "Shelf_ownerId_status_key"
ON "Shelf"("ownerId", "status");

CREATE UNIQUE INDEX "ReadingEntry_ownerId_bookId_key"
ON "ReadingEntry"("ownerId", "bookId");

ALTER TABLE "ReadingEntry"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
