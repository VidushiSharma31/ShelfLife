const bcrypt = require("bcrypt");
const prisma = require("../lib/prisma");

const seedDemo = async () => {
  const passwordHash = await bcrypt.hash("Password123!", 12);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "demo@example.com" },
      update: {},
      create: {
        displayName: "Demo Reader",
        email: "demo@example.com",
        passwordHash,
        bio: "Loves literary fiction and cozy mysteries.",
      },
    }),
    prisma.user.upsert({
      where: { email: "reader@example.com" },
      update: {},
      create: {
        displayName: "Reader One",
        email: "reader@example.com",
        passwordHash,
        bio: "Exploring the classics.",
      },
    }),
  ]);

  const books = [];

  for (const [index, item] of [
    ["Pride and Prejudice", "Jane Austen"],
    ["The Hobbit", "J.R.R. Tolkien"],
    ["The Left Hand of Darkness", "Ursula K. Le Guin"],
  ].entries()) {
    books.push(
      await prisma.book.upsert({
        where: { openLibraryId: `demo-book-${index + 1}` },
        update: {},
        create: {
          openLibraryId: `demo-book-${index + 1}`,
          title: item[0],
          description: `Demo description for ${item[0]}`,
          coverUrl: "",
          publicationYear: 2020 + index,
          genres: ["Fiction", "Classic"],
        },
      })
    );
  }

  for (const user of users) {
    const shelf = await prisma.shelf.upsert({
      where: { ownerId_name: { ownerId: user.id, name: "Want to Read" } },
      update: {},
      create: {
        ownerId: user.id,
        name: "Want to Read",
        visibility: "PUBLIC",
      },
    });

    await prisma.readingEntry.upsert({
      where: {
        ownerId_shelfId_bookId: {
          ownerId: user.id,
          shelfId: shelf.id,
          bookId: books[0].id,
        },
      },
      update: {},
      create: {
        ownerId: user.id,
        shelfId: shelf.id,
        bookId: books[0].id,
        status: "WANT_TO_READ",
      },
    });
  }

  console.log("Demo data seeded");
};

seedDemo()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
