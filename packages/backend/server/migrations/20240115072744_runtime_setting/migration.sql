-- CreateTable
CREATE TABLE "application_settings" (
    "key" VARCHAR(36) NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "application_settings_pkey" PRIMARY KEY ("key")
);
