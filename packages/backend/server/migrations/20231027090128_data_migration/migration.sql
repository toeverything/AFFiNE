-- CreateTable
CREATE TABLE "_data_migrations" (
    "id" VARCHAR(36) NOT NULL,
    "name" VARCHAR NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "_data_migrations_pkey" PRIMARY KEY ("id")
);
