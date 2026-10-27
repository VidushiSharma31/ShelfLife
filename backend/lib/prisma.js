const { PrismaClient } = require("@prisma/client");

const prisma = globalThis.__prisma ?? new PrismaClient();

globalThis.__prisma = prisma;

module.exports = prisma;
