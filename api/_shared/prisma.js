// OpenCITE — Prisma singleton
// Imported by all Node.js API routes. Safe for serverless cold-starts.
// Never import PrismaClient directly in route files.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
