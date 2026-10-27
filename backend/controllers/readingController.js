const { z } = require("zod");

const prisma = require("../lib/prisma");
const { serializeEntry } = require("./shelfController");
const { ensureDefaultShelves } = require("../services/shelfService");

const updateReading = async (req, res) => {
  const parsed = z.object({
    shelfId: z.string().min(1).optional(),
    currentPage: z.coerce.number().int().min(0).max(100000).nullable().optional(),
    totalPages: z.coerce.number().int().min(1).max(100000).nullable().optional(),
    personalRating: z.coerce.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  }).refine((value) => Object.keys(value).length > 0).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Provide at least one valid reading update" });
  }

  const data = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const entry = await tx.readingEntry.findFirst({
      where: { id: req.params.entryId, ownerId: req.user.id },
      include: { book: true, shelf: true },
    });
    if (!entry) return { error: "Reading entry not found", status: 404 };

    let shelf = entry.shelf;
    if (data.shelfId && data.shelfId !== entry.shelfId) {
      shelf = await tx.shelf.findFirst({
        where: { id: data.shelfId, ownerId: req.user.id },
      });
      if (!shelf) return { error: "Shelf not found", status: 404 };
    }

    const totalPages = entry.book.pageCount || data.totalPages || entry.totalPages;
    const currentPage = data.currentPage === undefined ? entry.currentPage : data.currentPage;
    if (totalPages && currentPage !== null && currentPage > totalPages) {
      return { error: "Current page cannot exceed the total page count", status: 400 };
    }

    const isRead = shelf.status === "READ";
    const savedEntry = await tx.readingEntry.update({
      where: { id: entry.id },
      data: {
        shelfId: shelf.id,
        status: shelf.status,
        currentPage: isRead ? totalPages ?? currentPage : currentPage,
        totalPages,
        personalRating: data.personalRating === undefined ? entry.personalRating : data.personalRating,
        notes: data.notes === undefined ? entry.notes : data.notes,
        startDate: shelf.status === "CURRENTLY_READING"
          ? entry.startDate || new Date()
          : entry.startDate,
        completionDate: isRead
          ? entry.completionDate || new Date()
          : entry.shelf.status === "READ" ? null : entry.completionDate,
        lastProgressUpdate: data.currentPage === undefined
          ? entry.lastProgressUpdate
          : new Date(),
      },
      include: { book: true, shelf: true },
    });
    return { entry: savedEntry };
  });

  if (result.error) {
    return res.status(result.status).json({ message: result.error });
  }
  return res.json({ entry: serializeEntry(result.entry) });
};

const removeReading = async (req, res) => {
  const entry = await prisma.readingEntry.findFirst({
    where: { id: req.params.entryId, ownerId: req.user.id },
    select: { id: true },
  });
  if (!entry) return res.status(404).json({ message: "Reading entry not found" });
  await prisma.readingEntry.delete({ where: { id: entry.id } });
  return res.json({ message: "Book removed from your shelves" });
};

const dashboard = async (req, res) => {
  const ownerId = req.user.id;
  await prisma.$transaction((tx) => ensureDefaultShelves(tx, ownerId));
  const [readCount, currentlyReadingCount, wantToReadCount, recentlyUpdated, currentBooks, shelves] =
    await Promise.all([
      prisma.readingEntry.count({ where: { ownerId, shelf: { status: "READ" } } }),
      prisma.readingEntry.count({ where: { ownerId, shelf: { status: "CURRENTLY_READING" } } }),
      prisma.readingEntry.count({ where: { ownerId, shelf: { status: "WANT_TO_READ" } } }),
      prisma.readingEntry.findMany({
        where: { ownerId },
        orderBy: [{ updatedAt: "desc" }],
        take: 6,
        include: { book: true, shelf: true },
      }),
      prisma.readingEntry.findMany({
        where: { ownerId, shelf: { status: "CURRENTLY_READING" } },
        orderBy: { updatedAt: "desc" },
        take: 6,
        include: { book: true, shelf: true },
      }),
      prisma.shelf.findMany({
        where: { ownerId },
        orderBy: [{ status: "asc" }, { createdAt: "asc" }],
        include: { _count: { select: { books: true } } },
      }),
    ]);

  return res.json({
    user: req.user,
    stats: { read: readCount, currentlyReading: currentlyReadingCount, wantToRead: wantToReadCount },
    recentlyUpdated: recentlyUpdated.map(serializeEntry),
    currentBooks: currentBooks.map(serializeEntry),
    shelves: shelves.map(({ id, name, status, visibility, _count }) => ({
      id, name, status, visibility, count: _count.books,
    })),
  });
};

module.exports = { updateReading, removeReading, dashboard };
