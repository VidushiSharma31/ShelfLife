const { z } = require("zod");

const prisma = require("../lib/prisma");
const { ensureDefaultShelves } = require("../services/shelfService");

const shelfInclude = {
  books: {
    orderBy: { updatedAt: "desc" },
    include: { book: true },
  },
};

const serializeEntry = (entry) => ({
  ...entry,
  progressPercent: entry.totalPages
    ? Math.min(100, Math.round((entry.currentPage || 0) / entry.totalPages * 100))
    : null,
});

const listShelves = async (req, res) => {
  await prisma.$transaction((tx) => ensureDefaultShelves(tx, req.user.id));
  const shelves = await prisma.shelf.findMany({
    where: { ownerId: req.user.id },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: shelfInclude,
  });

  return res.json({
    shelves: shelves.map((shelf) => ({
      ...shelf,
      books: shelf.books.map(serializeEntry),
    })),
  });
};

const createShelf = async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(300).nullable().optional(),
    visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Provide a shelf name up to 60 characters" });
  }

  try {
    const shelf = await prisma.shelf.create({
      data: { ...parsed.data, ownerId: req.user.id },
    });
    return res.status(201).json({ shelf });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "A shelf with that name already exists" });
    }
    throw error;
  }
};

const updateShelf = async (req, res) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(300).nullable().optional(),
    visibility: z.enum(["PRIVATE", "PUBLIC"]).optional(),
  }).refine((value) => Object.keys(value).length > 0).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Provide at least one valid shelf field" });
  }

  const existing = await prisma.shelf.findFirst({
    where: { id: req.params.shelfId, ownerId: req.user.id },
  });
  if (!existing) return res.status(404).json({ message: "Shelf not found" });

  try {
    const shelf = await prisma.shelf.update({
      where: { id: existing.id },
      data: parsed.data,
    });
    return res.json({ shelf });
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ message: "A shelf with that name already exists" });
    }
    throw error;
  }
};

const deleteShelf = async (req, res) => {
  const shelf = await prisma.shelf.findFirst({
    where: { id: req.params.shelfId, ownerId: req.user.id },
  });
  if (!shelf) return res.status(404).json({ message: "Shelf not found" });
  if (shelf.status) {
    return res.status(400).json({ message: "Default shelves cannot be deleted" });
  }

  await prisma.shelf.delete({ where: { id: shelf.id } });
  return res.json({ message: "Shelf deleted" });
};

const addBook = async (req, res) => {
  const parsed = z.object({
    openLibraryId: z.string().trim().min(1).max(100),
    title: z.string().trim().min(1).max(300),
    subtitle: z.string().trim().max(300).nullable().optional(),
    description: z.string().max(20000).nullable().optional(),
    coverUrl: z.string().url().or(z.literal("")).nullable().optional(),
    authors: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
    subjects: z.array(z.string().trim().min(1).max(100)).max(100).optional(),
    firstPublishYear: z.coerce.number().int().min(0).max(3000).nullable().optional(),
    pageCount: z.coerce.number().int().min(1).max(100000).nullable().optional(),
    isbn: z.string().trim().max(32).nullable().optional(),
    currentPage: z.coerce.number().int().min(0).max(100000).nullable().optional(),
    personalRating: z.coerce.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Book metadata is invalid" });

  const shelf = await prisma.shelf.findFirst({
    where: { id: req.params.shelfId, ownerId: req.user.id },
  });
  if (!shelf) return res.status(404).json({ message: "Shelf not found" });

  const data = parsed.data;
  const bookCreateData = {
    openLibraryId: data.openLibraryId,
    title: data.title,
    authorNames: data.authors || [],
    genres: data.subjects || [],
    ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
    ...(data.firstPublishYear !== undefined ? { publicationYear: data.firstPublishYear } : {}),
    ...(data.pageCount !== undefined ? { pageCount: data.pageCount } : {}),
    ...(data.isbn !== undefined ? { isbn: data.isbn } : {}),
  };
  const bookUpdateData = {
    title: data.title,
    ...(data.subtitle !== undefined ? { subtitle: data.subtitle } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
    ...(data.authors !== undefined ? { authorNames: data.authors } : {}),
    ...(data.subjects !== undefined ? { genres: data.subjects } : {}),
    ...(data.firstPublishYear !== undefined ? { publicationYear: data.firstPublishYear } : {}),
    ...(data.pageCount !== undefined ? { pageCount: data.pageCount } : {}),
    ...(data.isbn !== undefined ? { isbn: data.isbn } : {}),
  };
  const result = await prisma.$transaction(async (tx) => {
    const book = await tx.book.upsert({
      where: { openLibraryId: data.openLibraryId },
      create: bookCreateData,
      update: bookUpdateData,
    });

    const existing = await tx.readingEntry.findUnique({
      where: { ownerId_bookId: { ownerId: req.user.id, bookId: book.id } },
    });
    const isRead = shelf.status === "READ";
    const pageTotal = book.pageCount;
    const currentPage = data.currentPage ?? (isRead ? pageTotal : null);
    if (pageTotal && currentPage !== null && currentPage > pageTotal) {
      throw Object.assign(new Error("Current page exceeds the book's page count"), { statusCode: 400 });
    }

    const savedEntry = await tx.readingEntry.upsert({
      where: { ownerId_bookId: { ownerId: req.user.id, bookId: book.id } },
      create: {
        ownerId: req.user.id,
        shelfId: shelf.id,
        bookId: book.id,
        status: shelf.status,
        currentPage: isRead ? pageTotal ?? currentPage : currentPage,
        totalPages: pageTotal,
        personalRating: data.personalRating,
        notes: data.notes,
        startDate: shelf.status === "CURRENTLY_READING" ? new Date() : null,
        completionDate: isRead ? new Date() : null,
        lastProgressUpdate: currentPage === null ? null : new Date(),
      },
      update: {
        shelfId: shelf.id,
        status: shelf.status,
        totalPages: pageTotal,
        currentPage: isRead ? pageTotal ?? currentPage : currentPage ?? existing?.currentPage ?? null,
        personalRating: data.personalRating ?? existing?.personalRating ?? null,
        notes: data.notes ?? existing?.notes ?? null,
        startDate: shelf.status === "CURRENTLY_READING"
          ? existing?.startDate || new Date()
          : existing?.startDate,
        completionDate: isRead ? existing?.completionDate || new Date() : null,
        lastProgressUpdate: currentPage === null ? existing?.lastProgressUpdate : new Date(),
      },
      include: { book: true, shelf: true },
    });
    return {
      entry: savedEntry,
      alreadyExists: Boolean(existing),
      alreadyOnShelf: Boolean(existing && existing.shelfId === shelf.id),
    };
  });

  return res.status(result.alreadyExists ? 200 : 201).json({
    entry: serializeEntry(result.entry),
    alreadyOnShelf: result.alreadyOnShelf,
  });
};

module.exports = {
  listShelves,
  createShelf,
  updateShelf,
  deleteShelf,
  addBook,
  serializeEntry,
};
