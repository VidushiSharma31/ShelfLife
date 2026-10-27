const jwt = require("jsonwebtoken");

const prisma = require("../lib/prisma");
const { accessSecret } = require("../utils/auth");

const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  let payload;
  try {
    payload = jwt.verify(token, accessSecret);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      displayName: true,
      email: true,
      profilePictureUrl: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
      tokenVersion: true,
    },
  });

  if (!user || payload.ver !== user.tokenVersion) {
    return res.status(401).json({ message: "User no longer exists" });
  }

  delete user.tokenVersion;
  req.user = user;
  return next();
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) return next();

  let payload;
  try {
    payload = jwt.verify(token, accessSecret);
  } catch {
    return next();
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, tokenVersion: true },
  });
  if (user && payload.ver === user.tokenVersion) {
    req.authenticatedUserId = user.id;
  }

  return next();
};

module.exports = {
  requireAuth,
  optionalAuth,
};
