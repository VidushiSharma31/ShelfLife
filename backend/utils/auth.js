const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const accessSecret = process.env.JWT_ACCESS_SECRET || "development-access-secret";
const refreshSecret = process.env.JWT_REFRESH_SECRET || "development-refresh-secret";

const normalizeEmail = (value = "") => value.trim().toLowerCase();

const buildAccessToken = (user) =>
  jwt.sign(
    {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
      ver: user.tokenVersion || 0,
    },
    accessSecret,
    { expiresIn: "15m" }
  );

const buildRefreshToken = () => crypto.randomBytes(32).toString("hex");

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

module.exports = {
  normalizeEmail,
  buildAccessToken,
  buildRefreshToken,
  hashToken,
  accessSecret,
  refreshSecret,
};
