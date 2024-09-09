-- CreateIndex
CREATE INDEX "users_email_lowercase_idx" ON "users"(lower("email"))
