const DEFAULT_SHELVES = [
  { name: "Want to Read", status: "WANT_TO_READ" },
  { name: "Currently Reading", status: "CURRENTLY_READING" },
  { name: "Read", status: "READ" },
  { name: "On Hold", status: "ON_HOLD" },
  { name: "Dropped", status: "DROPPED" },
];

const ensureDefaultShelves = async (client, ownerId) => {
  for (const shelf of DEFAULT_SHELVES) {
    const existing = await client.shelf.findFirst({
      where: { ownerId, status: shelf.status },
    });

    if (existing) {
      continue;
    }

    await client.shelf.upsert({
      where: { ownerId_name: { ownerId, name: shelf.name } },
      create: { ownerId, name: shelf.name, status: shelf.status },
      update: { status: shelf.status },
    });
  }
};

module.exports = { DEFAULT_SHELVES, ensureDefaultShelves };
