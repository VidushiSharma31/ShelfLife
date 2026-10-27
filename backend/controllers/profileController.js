const { z } = require("zod");

const prisma = require("../lib/prisma");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { mkdir, unlink, writeFile } = require("node:fs/promises");
const { SUPPORTED_GENRES, normalizeGenres } = require("../utils/genres");

const uploadDirectory = path.join(__dirname, "..", "uploads");
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const PROFILE_PICTURE_PATTERN = /^\/uploads\/[a-f0-9-]+\.(?:jpg|png|webp)$/;

const safeProfile = (user) => ({
  id: user.id,
  displayName: user.displayName,
  profilePictureUrl: user.profilePictureUrl,
  bio: user.bio,
  createdAt: user.createdAt,
});

const updateProfile = async (req, res) => {
  const parsed = z.object({
    displayName: z.string().trim().min(2).max(60).optional(),
    bio: z.string().trim().max(500).nullable().optional(),
  }).refine((value) => Object.keys(value).length > 0).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Provide valid profile details" });
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: parsed.data,
    select: {
      id: true,
      displayName: true,
      email: true,
      profilePictureUrl: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
      genres: { select: { genre: true } },
    },
  });
  user.favoriteGenres = user.genres.map(({ genre }) => genre);
  delete user.genres;
  return res.json({ user });
};

const getFavoriteGenres = async (req, res) => {
  const preferences = await prisma.userGenre.findMany({
    where: { userId: req.user.id },
    select: { genre: true },
    orderBy: { genre: "asc" },
  });
  return res.json({ genres: preferences.map(({ genre }) => genre), supportedGenres: SUPPORTED_GENRES });
};

const updateFavoriteGenres = async (req, res) => {
  const parsed = z.object({
    genres: z.array(z.enum(SUPPORTED_GENRES)).max(SUPPORTED_GENRES.length),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Choose only supported genres" });
  }

  const genres = normalizeGenres(parsed.data.genres);
  await prisma.$transaction(async (tx) => {
    await tx.userGenre.deleteMany({ where: { userId: req.user.id } });
    if (genres.length) {
      await tx.userGenre.createMany({
        data: genres.map((genre) => ({ userId: req.user.id, genre })),
      });
    }
  });
  return res.json({ genres });
};

const storedAvatarPath = (profilePictureUrl) => {
  if (!PROFILE_PICTURE_PATTERN.test(profilePictureUrl || "")) return null;
  return path.join(uploadDirectory, path.basename(profilePictureUrl));
};

const removeStoredAvatar = async (profilePictureUrl) => {
  const filePath = storedAvatarPath(profilePictureUrl);
  if (filePath) await unlink(filePath).catch((error) => {
    if (error.code !== "ENOENT") throw error;
  });
};

const identifyImage = (buffer) => {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
};

const uploadProfilePicture = async (req, res) => {
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ message: "Choose a JPEG, PNG, or WebP image" });
  }
  if (req.body.length > MAX_AVATAR_BYTES) {
    return res.status(413).json({ message: "Profile images must be 5 MB or smaller" });
  }

  const extension = identifyImage(req.body);
  if (!extension) {
    return res.status(400).json({ message: "The uploaded file is not a supported image" });
  }

  await mkdir(uploadDirectory, { recursive: true });
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadDirectory, filename), req.body, { flag: "wx" });

  try {
    const previous = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { profilePictureUrl: true },
    });
    const profilePictureUrl = `/uploads/${filename}`;
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: { profilePictureUrl },
      select: {
        id: true,
        displayName: true,
        email: true,
        profilePictureUrl: true,
        bio: true,
        createdAt: true,
        updatedAt: true,
        genres: { select: { genre: true } },
      },
    });
    user.favoriteGenres = user.genres.map(({ genre }) => genre);
    delete user.genres;
    try {
      await removeStoredAvatar(previous?.profilePictureUrl);
    } catch (cleanupError) {
      console.error("Could not remove the replaced profile image:", cleanupError);
    }
    return res.json({ user });
  } catch (error) {
    try {
      await unlink(path.join(uploadDirectory, filename));
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") {
        console.error("Could not remove an incomplete profile image upload:", cleanupError);
      }
    }
    throw error;
  }
};

const removeProfilePicture = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { profilePictureUrl: true },
  });
  if (!user) return res.status(404).json({ message: "Profile not found" });
  const updatedUser = await prisma.user.update({
    where: { id: req.user.id },
    data: { profilePictureUrl: null },
    select: {
      id: true,
      displayName: true,
      email: true,
      profilePictureUrl: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
      genres: { select: { genre: true } },
    },
  });
  try {
    await removeStoredAvatar(user.profilePictureUrl);
  } catch (cleanupError) {
    console.error("Could not remove the deleted profile image:", cleanupError);
  }
  updatedUser.favoriteGenres = updatedUser.genres.map(({ genre }) => genre);
  delete updatedUser.genres;
  return res.json({ user: updatedUser });
};

const getPublicProfile = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.userId },
    select: {
      id: true,
      displayName: true,
      profilePictureUrl: true,
      bio: true,
      createdAt: true,
      shelves: {
        where: { visibility: "PUBLIC" },
        orderBy: { createdAt: "asc" },
        include: {
          books: {
            orderBy: { updatedAt: "desc" },
            include: { book: true },
          },
        },
      },
    },
  });
  if (!user) return res.status(404).json({ message: "Profile not found" });

  const publicStats = user.shelves.reduce((stats, shelf) => {
    if (shelf.status === "READ") stats.read += shelf.books.length;
    if (shelf.status === "CURRENTLY_READING") stats.currentlyReading += shelf.books.length;
    if (shelf.status === "WANT_TO_READ") stats.wantToRead += shelf.books.length;
    return stats;
  }, { read: 0, currentlyReading: 0, wantToRead: 0 });

  return res.json({
    profile: safeProfile(user),
    stats: publicStats,
    shelves: user.shelves.map((shelf) => ({
      id: shelf.id,
      name: shelf.name,
      books: shelf.books.map((entry) => ({
        book: entry.book,
        shelf: { id: shelf.id, name: shelf.name },
        currentPage: entry.currentPage,
        totalPages: entry.totalPages,
        progressPercent: entry.totalPages
          ? Math.min(100, Math.round((entry.currentPage || 0) / entry.totalPages * 100))
          : null,
      })),
    })),
  });
};

module.exports = {
  updateProfile,
  getPublicProfile,
  getFavoriteGenres,
  updateFavoriteGenres,
  uploadProfilePicture,
  removeProfilePicture,
  identifyImage,
  MAX_AVATAR_BYTES,
};
