BEGIN;

CREATE TABLE "cloud_subscription_bindings" (
  "user_id" VARCHAR NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan_family" TEXT NOT NULL CHECK ("plan_family" IN ('pro', 'ai')),
  "bound_provider_namespace" TEXT,
  "bound_source_identity" TEXT,
  "conflicted" BOOLEAN NOT NULL DEFAULT false,

  CONSTRAINT "cloud_subscription_bindings_pkey" PRIMARY KEY ("user_id", "plan_family"),
  CONSTRAINT "cloud_subscription_bindings_identity_check" CHECK (
    ("bound_provider_namespace" IS NULL) = ("bound_source_identity" IS NULL)
  )
);

-- Preserve a unique effective projection or, where there is none, an exact
-- canonical billing relationship. Ambiguous identities need provider verification.
WITH sources AS MATERIALIZED (
  SELECT s.id, s.target_id, s.provider, s.provider_namespace, s.source_identity, s.status,
    s.gives_access, s.trial_end, e.id AS entitlement_id,
    CASE WHEN s.plan = 'ai' THEN 'ai' ELSE 'pro' END AS plan_family,
    COALESCE(
      e.metadata->>'selected' = 'true'
      AND e.status IN ('active', 'grace')
      AND (e.starts_at IS NULL OR e.starts_at <= statement_timestamp())
      AND (e.expires_at IS NULL OR e.expires_at > statement_timestamp())
      AND (e.grace_until IS NULL OR e.grace_until > statement_timestamp()),
      false
    ) AS projected,
    NOT (
      (s.plan = 'lifetime_pro' OR s.recurring IS NOT DISTINCT FROM 'lifetime')
      AND e.metadata->>'financialRestriction' IS NOT DISTINCT FROM 'revoke'
    ) AND (
      (s.status IN ('active', 'trialing') AND
        (s.period_end IS NULL OR s.period_end > statement_timestamp() OR s.canceled_at IS NULL))
      OR s.status IN ('past_due', 'in_grace_period', 'in_billing_retry')
      OR (s.provider = 'stripe' AND s.status = 'incomplete')
    ) AS occupying
  FROM provider_subscriptions s
  JOIN users u ON u.id = s.target_id
  LEFT JOIN entitlements e ON e.target_type = 'user' AND e.target_id = s.target_id
    AND e.source = 'cloud_subscription'
    AND e.plan = CASE WHEN s.plan = 'pro' AND s.recurring = 'lifetime' THEN 'lifetime_pro' ELSE s.plan END
    AND e.metadata->>'providerSubscriptionId' = s.id
    AND e.subject_id = s.provider_namespace || ':source:' || octet_length(s.source_identity) || ':' || s.source_identity
  WHERE s.target_type = 'user' AND s.plan IN ('pro', 'lifetime_pro', 'ai')
    AND s.provider_namespace IS NOT NULL AND s.source_identity IS NOT NULL
), families AS (
  SELECT target_id, plan_family,
    count(DISTINCT provider) FILTER (WHERE projected OR occupying) > 1 AS conflicted,
    count(*) FILTER (WHERE projected) AS projected_count,
    count(*) FILTER (WHERE occupying) AS occupying_count
  FROM sources
  GROUP BY target_id, plan_family
), bindings AS (
  INSERT INTO cloud_subscription_bindings (
    user_id, plan_family, bound_provider_namespace, bound_source_identity, conflicted
  )
  SELECT f.target_id, f.plan_family, s.provider_namespace, s.source_identity, f.conflicted
  FROM families f
  LEFT JOIN sources s ON s.target_id = f.target_id AND s.plan_family = f.plan_family
    AND (
      (s.projected AND f.projected_count = 1)
      OR (NOT f.conflicted AND f.projected_count = 0 AND f.occupying_count = 1
          AND s.occupying AND s.entitlement_id IS NOT NULL)
    )
  WHERE f.conflicted OR s.entitlement_id IS NOT NULL
  RETURNING *
)
UPDATE entitlements e
SET metadata = e.metadata || jsonb_build_object(
    'conflictMember', b.conflicted AND (s.projected OR s.occupying),
    'paidFrom', CASE
      WHEN b.plan_family = 'ai' AND s.projected AND e.status = 'active'
        AND s.status = 'active' AND s.gives_access IS DISTINCT FROM false
        AND s.provider_namespace = b.bound_provider_namespace AND s.source_identity = b.bound_source_identity
      THEN COALESCE(s.trial_end, statement_timestamp())
    END
  ),
  status = CASE
    WHEN b.conflicted AND b.bound_source_identity IS NULL AND s.projected THEN 'expired'
    ELSE e.status
  END
FROM sources s
JOIN bindings b ON b.user_id = s.target_id AND b.plan_family = s.plan_family
WHERE e.id = s.entitlement_id;

ALTER TABLE "payment_operations"
  DROP CONSTRAINT "payment_operations_status_check",
  ADD CONSTRAINT "payment_operations_status_check"
    CHECK ("status" IN ('pending', 'waiting', 'completed', 'rejected', 'blocked'));

DROP INDEX "payment_operations_unfinished_resource_key";
CREATE UNIQUE INDEX "payment_operations_unfinished_resource_key"
  ON "payment_operations"("provider_namespace", "primary_resource_key")
  WHERE "status" IN ('pending', 'blocked')
    AND "operation_type" NOT IN ('purchase_checkout', 'app_store_purchase');

CREATE UNIQUE INDEX "payment_operations_unfinished_purchase_key"
  ON "payment_operations"("primary_resource_key")
  WHERE "status" IN ('pending', 'waiting', 'blocked')
    AND "operation_type" IN ('purchase_checkout', 'app_store_purchase');

CREATE INDEX "payment_operations_waiting_checkout_session_idx"
  ON "payment_operations"("provider_namespace", ("result"->>'sessionId'))
  WHERE "status" = 'waiting' AND "operation_type" = 'purchase_checkout';

CREATE TABLE "payment_reconciliations" (
  "request_id" TEXT PRIMARY KEY,
  "actor_user_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "plan_family" TEXT NOT NULL CHECK ("plan_family" IN ('pro', 'ai')),
  "attempt_id" TEXT,
  "transaction_id" TEXT,
  "evidence" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "payment_reconciliations_user_family_created_idx"
  ON "payment_reconciliations" ("user_id", "plan_family", "created_at");

COMMIT;
