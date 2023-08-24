-- CreateTable
CREATE TABLE "new_features_waiting_list" (
    "id" VARCHAR NOT NULL,
    "email" TEXT NOT NULL,
    "type" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "new_features_waiting_list_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "new_features_waiting_list_email_key" ON "new_features_waiting_list"("email");
