const bcrypt = require("bcrypt");
const { z } = require("zod");

const prisma = require("../lib/prisma");
const {
  normalizeEmail,
  buildAccessToken,
  buildRefreshToken,
  hashToken,
} = require("../utils/auth");
const { ensureDefaultShelves } = require("../services/shelfService");
const { SUPPORTED_GENRES, normalizeGenres } = require("../utils/genres");

const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(60),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  favoriteGenres: z.array(z.enum(SUPPORTED_GENRES)).max(SUPPORTED_GENRES.length).optional().default([]),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

const safeUser = (user) => ({
  id: user.id,
  displayName: user.displayName,
  email: user.email,
  profilePictureUrl: user.profilePictureUrl,
  bio: user.bio,
  favoriteGenres: normalizeGenres((user.genres || []).map(({ genre }) => genre)),
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const refreshCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
};

const setRefreshCookie = (res, token) => {
  res.cookie("refreshToken", token, refreshCookieOptions);
};

const issueRefreshToken = async (userId, client = prisma, refreshToken = buildRefreshToken()) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await client.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt,
    },
  });

  return refreshToken;
};

const rotateRefreshToken = async (oldToken, userId) => {
  const tokenHash = hashToken(oldToken);
  const replacement = buildRefreshToken();
  await prisma.$transaction(async (tx) => {
    const current = await tx.refreshToken.findFirst({
      where: {
        userId,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!current) {
      throw new Error("Refresh token invalid");
    }

    await tx.refreshToken.delete({ where: { id: current.id } });
    await issueRefreshToken(userId, tx, replacement);
  });
  return replacement;
};

const register = async (req, res) => {
  try {
    const validated = registerSchema.safeParse(req.body);

    if (!validated.success) {
      return res.status(400).json({ message: "Please provide a valid display name, email, and password" });
    }

    const { displayName, email, password, favoriteGenres } = validated.data;
    const normalizedEmail = normalizeEmail(email);

    const passwordHash = await bcrypt.hash(password, 12);
    const refreshToken = buildRefreshToken();
    const user = await prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: { displayName, email: normalizedEmail, passwordHash },
      });
      const genres = normalizeGenres(favoriteGenres);
      if (genres.length) {
        await tx.userGenre.createMany({
          data: genres.map((genre) => ({ userId: createdUser.id, genre })),
        });
      }
      await ensureDefaultShelves(tx, createdUser.id);
      await issueRefreshToken(createdUser.id, tx, refreshToken);
      return { ...createdUser, genres: genres.map((genre) => ({ genre })) };
    });

    const accessToken = buildAccessToken(user);
    setRefreshCookie(res, refreshToken);

    return res.status(201).json({
      user: safeUser(user),
      accessToken,
    });
  } catch (error) {
    console.error("Registration error:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ message: "An account with that email already exists" });
    }
    return res.status(500).json({ message: "Unable to create account" });
  }
};

const login = async (req, res) => {
  try {
    const validated = loginSchema.safeParse(req.body);

    if (!validated.success) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const { email, password } = validated.data;
    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { genres: true },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);

    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    await prisma.$transaction((tx) => ensureDefaultShelves(tx, user.id));
    const accessToken = buildAccessToken(user);
    const refreshToken = await issueRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);

    return res.json({
      user: safeUser(user),
      accessToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Unable to log in" });
  }
};

const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await prisma.refreshToken.deleteMany({ where: { tokenHash } });
    }

    if (req.authenticatedUserId) {
      await prisma.user.update({
        where: { id: req.authenticatedUserId },
        data: { tokenVersion: { increment: 1 } },
      });
    }

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    return res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Unable to log out" });
  }
};

const getCurrentUser = async (req, res) => {
  return res.json({ user: req.user });
};

const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const tokenHash = hashToken(refreshToken);
    const validToken = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!validToken) {
      return res.status(401).json({ message: "Refresh token invalid or expired" });
    }

    const rotatedToken = await rotateRefreshToken(refreshToken, validToken.userId);
    const user = await prisma.user.findUnique({
      where: { id: validToken.userId },
      include: { genres: true },
    });

    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    const accessToken = buildAccessToken(user);
    setRefreshCookie(res, rotatedToken);

    return res.json({ accessToken, user: safeUser(user) });
  } catch (error) {
    console.error("Refresh token error:", error);
    return res.status(error.message === "Refresh token invalid" ? 401 : 500).json({
      message: error.message === "Refresh token invalid" ? "Refresh token invalid or expired" : "Unable to refresh session",
    });
  }
};

module.exports = {
  register,
  login,
  logout,
  getCurrentUser,
  refreshAccessToken,
  registerSchema,
};
