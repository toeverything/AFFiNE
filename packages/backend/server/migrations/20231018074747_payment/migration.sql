-- CreateTable
CREATE TABLE "user_stripe_customers" (
    "user_id" VARCHAR NOT NULL,
    "stripe_customer_id" VARCHAR NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_stripe_customers_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "plan" VARCHAR(20) NOT NULL,
    "recurring" VARCHAR(20) NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "start" TIMESTAMPTZ(6) NOT NULL,
    "end" TIMESTAMPTZ(6) NOT NULL,
    "next_bill_at" TIMESTAMPTZ(6),
    "canceled_at" TIMESTAMPTZ(6),
    "trial_start" TIMESTAMPTZ(6),
    "trial_end" TIMESTAMPTZ(6),
    "stripe_schedule_id" VARCHAR,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invoices" (
    "id" SERIAL NOT NULL,
    "user_id" VARCHAR(36) NOT NULL,
    "stripe_invoice_id" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "plan" VARCHAR(20) NOT NULL,
    "recurring" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" VARCHAR NOT NULL,
    "last_payment_error" TEXT,

    CONSTRAINT "user_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_stripe_customers_stripe_customer_id_key" ON "user_stripe_customers"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_user_id_key" ON "user_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscriptions_stripe_subscription_id_key" ON "user_subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_invoices_stripe_invoice_id_key" ON "user_invoices"("stripe_invoice_id");

-- AddForeignKey
ALTER TABLE "user_stripe_customers" ADD CONSTRAINT "user_stripe_customers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invoices" ADD CONSTRAINT "user_invoices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
