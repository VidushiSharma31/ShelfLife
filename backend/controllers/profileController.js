const { z } = require("zod");

const prisma = require("../lib/prisma");

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
    profilePictureUrl: z.string().url().nullable().or(z.literal("")).optional(),
  }).refine((value) => Object.keys(value).length > 0).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Provide valid profile details" });
  }

  const data = {
    ...parsed.data,
    profilePictureUrl: parsed.data.profilePictureUrl || null,
  };
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
    select: {
      id: true,
      displayName: true,
      email: true,
      profilePictureUrl: true,
      bio: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return res.json({ user });
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

module.exports = { updateProfile, getPublicProfile };
