CREATE TABLE "UserGenre" (
    "userId" TEXT NOT NULL,
    "genre" TEXT NOT NULL,

    CONSTRAINT "UserGenre_pkey" PRIMARY KEY ("userId", "genre")
);

CREATE INDEX "UserGenre_genre_idx" ON "UserGenre"("genre");

ALTER TABLE "UserGenre"
ADD CONSTRAINT "UserGenre_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
