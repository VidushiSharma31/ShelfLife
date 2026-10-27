const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeEmail, buildAccessToken, hashToken } = require("../utils/auth");
const { DEFAULT_SHELVES, ensureDefaultShelves } = require("../services/shelfService");

test("normalizeEmail trims and lowercases addresses", () => {
  assert.equal(normalizeEmail("  User@Example.com  "), "user@example.com");
});

test("buildAccessToken includes a user id in the payload", () => {
  const token = buildAccessToken({ id: "user_123", email: "demo@example.com", displayName: "Demo", tokenVersion: 3 });
  const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));

  assert.equal(payload.sub, "user_123");
  assert.equal(payload.email, "demo@example.com");
  assert.equal(payload.ver, 3);
});

test("hashToken is stable across identical values", () => {
  assert.equal(hashToken("secret-value"), hashToken("secret-value"));
});

test("default shelves are created once per user", async () => {
  const shelves = [];
  const client = {
    shelf: {
      findFirst: async ({ where }) => shelves.find((shelf) =>
        shelf.ownerId === where.ownerId && shelf.status === where.status
      ) || null,
      upsert: async ({ where, create, update }) => {
        const shelf = shelves.find((item) =>
          item.ownerId === where.ownerId_name.ownerId && item.name === where.ownerId_name.name
        );
        if (shelf) {
          Object.assign(shelf, update);
          return shelf;
        }
        const created = { id: `shelf_${shelves.length}`, ...create };
        shelves.push(created);
        return created;
      },
    },
  };

  await ensureDefaultShelves(client, "reader_1");
  await ensureDefaultShelves(client, "reader_1");

  assert.equal(shelves.length, DEFAULT_SHELVES.length);
  assert.deepEqual(
    shelves.map(({ name, status }) => ({ name, status })),
    DEFAULT_SHELVES
  );
});
