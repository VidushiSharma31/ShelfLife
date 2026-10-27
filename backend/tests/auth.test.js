const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeEmail, buildAccessToken, hashToken } = require("../utils/auth");
const { DEFAULT_SHELVES, ensureDefaultShelves } = require("../services/shelfService");
const { SUPPORTED_GENRES, normalizeGenres } = require("../utils/genres");
const { registerSchema } = require("../controllers/authController");
const { identifyImage } = require("../controllers/profileController");
const { requireAuth } = require("../middleware/auth");

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

test("genre preferences are deduplicated and the supported list is available", () => {
  assert.deepEqual(normalizeGenres(["Fantasy", "Fantasy", "History"]), ["Fantasy", "History"]);
  assert.ok(SUPPORTED_GENRES.includes("Science Fiction"));
});

test("registration accepts no genres or supported genres and rejects unsupported values", () => {
  const account = { displayName: "Reader", email: "reader@example.com", password: "password123" };
  assert.equal(registerSchema.safeParse(account).success, true);
  assert.equal(registerSchema.safeParse({ ...account, favoriteGenres: ["Fantasy", "History"] }).success, true);
  assert.equal(registerSchema.safeParse({ ...account, favoriteGenres: ["Not a genre"] }).success, false);
});

test("avatar validation recognizes supported image signatures, not MIME labels", () => {
  assert.equal(identifyImage(Buffer.from([0xff, 0xd8, 0xff, 0x00])), "jpg");
  assert.equal(identifyImage(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "png");
  assert.equal(identifyImage(Buffer.from("RIFFxxxxWEBP", "ascii")), "webp");
  assert.equal(identifyImage(Buffer.from("not an image")), null);
});

test("protected requests without a token are rejected", async () => {
  let statusCode;
  let message;
  await requireAuth(
    { headers: {} },
    {
      status(code) {
        statusCode = code;
        return this;
      },
      json(body) {
        message = body.message;
      },
    },
    () => assert.fail("Unauthenticated requests must not continue"),
  );
  assert.equal(statusCode, 401);
  assert.equal(message, "Authentication required");
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
