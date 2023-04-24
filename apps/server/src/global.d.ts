declare namespace Express {
  interface Request {
    user?: import('@prisma/client').User | null;
  }
}
