SET affine.permission_projection.enabled = 'off';

-- Final copy. Existing rows are authoritative and are never overwritten.
INSERT INTO "workspace_access_policies" (
  "workspace_id", "visibility", "sharing_enabled", "url_preview_enabled"
)
SELECT
  w."id",
  CASE WHEN w."public" THEN 'public' ELSE 'private' END,
  w."enable_sharing",
  w."enable_url_preview"
FROM "workspaces" w
ON CONFLICT ("workspace_id") DO NOTHING;

INSERT INTO "workspace_members" (
  "workspace_id", "user_id", "role", "state", "source", "created_at", "updated_at"
)
SELECT
  p."workspace_id",
  p."user_id",
  affine_permission_legacy_workspace_role(p."type"),
  'active',
  CASE p."source"::text WHEN 'Link' THEN 'link' ELSE 'email' END,
  p."created_at",
  p."updated_at"
FROM "workspace_user_permissions" p
WHERE p."status" = 'Accepted'::"WorkspaceMemberStatus"
  AND affine_permission_legacy_workspace_role(p."type") IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "workspace_invitations" (
  "workspace_id", "invitee_user_id", "inviter_user_id", "requested_role",
  "status", "kind", "created_at", "updated_at"
)
SELECT
  p."workspace_id",
  p."user_id",
  p."inviter_id",
  CASE affine_permission_legacy_workspace_role(p."type")
    WHEN 'admin' THEN 'admin'
    ELSE 'member'
  END,
  affine_permission_workspace_invitation_state(p."status"),
  CASE p."source"::text WHEN 'Link' THEN 'link' ELSE 'email' END,
  p."created_at",
  p."updated_at"
FROM "workspace_user_permissions" p
WHERE p."status" <> 'Accepted'::"WorkspaceMemberStatus"
  AND affine_permission_legacy_workspace_role(p."type") IS NOT NULL
  AND affine_permission_workspace_invitation_state(p."status") IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "doc_access_policies" (
  "workspace_id", "doc_id", "visibility", "public_role",
  "member_default_role", "published_at"
)
SELECT
  p."workspace_id",
  p."page_id",
  CASE WHEN p."public" THEN 'public' ELSE 'private' END,
  CASE WHEN p."public" THEN 'external' ELSE NULL END,
  affine_permission_legacy_default_doc_role(p."defaultRole"),
  p."published_at"
FROM "workspace_pages" p
ON CONFLICT ("workspace_id", "doc_id") DO NOTHING;

INSERT INTO "doc_grants" (
  "workspace_id", "doc_id", "principal_type", "principal_id", "role", "created_at"
)
SELECT
  p."workspace_id",
  p."page_id",
  'user',
  p."user_id",
  affine_permission_legacy_doc_role(p."type"),
  p."created_at"
FROM "workspace_page_user_permissions" p
WHERE affine_permission_legacy_doc_role(p."type") IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "effective_workspace_quota_states" (
  "workspace_id", "plan", "seat_limit", "member_count",
  "overcapacity_member_count", "blob_limit", "storage_quota",
  "history_period_seconds", "readonly", "readonly_reasons", "known",
  "stale", "last_reconciled_at", "stale_after", "created_at", "updated_at"
)
SELECT
  s."workspace_id",
  'free',
  3,
  0,
  0,
  10485760,
  10737418240,
  604800,
  s."readonly",
  s."readonly_reasons",
  s."known",
  NOT s."known",
  s."last_reconciled_at",
  s."stale_after",
  s."created_at",
  s."updated_at"
FROM "workspace_runtime_states" s
ON CONFLICT ("workspace_id") DO NOTHING;

INSERT INTO "provider_subscriptions" (
  "id", "provider", "target_type", "target_id", "plan", "recurring",
  "status", "external_customer_id", "external_subscription_id",
  "external_product_id", "iap_store", "external_ref", "quantity",
  "period_start", "period_end", "trial_start", "trial_end", "canceled_at",
  "metadata", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  s."provider",
  CASE
    WHEN s."plan" = 'team' THEN 'workspace'
    WHEN s."plan" IN ('selfhosted', 'selfhostedteam') THEN 'instance'
    ELSE 'user'
  END,
  s."target_id",
  s."plan",
  s."recurring",
  s."status",
  CASE WHEN s."provider" = 'revenuecat'::"Provider" THEN s."target_id" END,
  CASE
    WHEN s."provider" = 'stripe'::"Provider"
      THEN COALESCE(s."stripe_subscription_id", 'legacy_subscription:' || s."id"::text)
  END,
  CASE
    WHEN s."provider" = 'revenuecat'::"Provider"
      THEN COALESCE(s."rc_product_id", 'legacy_product:' || s."id"::text)
  END,
  CASE
    WHEN s."provider" = 'revenuecat'::"Provider"
      THEN COALESCE(s."iap_store", 'app_store'::"IapStore")
  END,
  CASE
    WHEN s."provider" = 'revenuecat'::"Provider"
      THEN COALESCE(s."rc_external_ref", 'legacy_subscription:' || s."id"::text)
  END,
  s."quantity",
  s."start",
  s."end",
  s."trial_start",
  s."trial_end",
  s."canceled_at",
  jsonb_strip_nulls(jsonb_build_object(
    'variant', s."variant",
    'stripeScheduleId', s."stripe_schedule_id",
    'nextBillAt', s."next_bill_at",
    'entitlement', s."rc_entitlement",
    'legacySubscriptionId', s."id",
    'legacyRevenueCatIdentityIncomplete',
      s."provider" = 'revenuecat'::"Provider"
  )),
  s."created_at",
  s."updated_at"
FROM "subscriptions" s
ON CONFLICT DO NOTHING;

INSERT INTO "entitlements" (
  "id", "target_type", "target_id", "source", "plan", "status",
  "subject_id", "quantity", "metadata", "starts_at", "expires_at",
  "validated_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  ps."target_type",
  ps."target_id",
  'cloud_subscription',
  CASE
    WHEN ps."plan" = 'pro' AND ps."recurring" = 'lifetime' THEN 'lifetime_pro'
    WHEN ps."plan" = 'selfhostedteam' THEN 'selfhost_team'
    ELSE ps."plan"
  END,
  CASE
    WHEN ps."status" IN ('active', 'trialing') THEN 'active'
    WHEN ps."status" = 'past_due' THEN 'grace'
    WHEN ps."status" = 'canceled' THEN 'revoked'
    ELSE 'expired'
  END,
  CASE
    WHEN ps."provider" = 'stripe'::"Provider" THEN ps."external_subscription_id"
    ELSE ps."id"
  END,
  CASE WHEN ps."target_type" = 'workspace' THEN GREATEST(ps."quantity", 1) END,
  jsonb_build_object('providerSubscriptionId', ps."id", 'recurring', ps."recurring"),
  ps."period_start",
  ps."period_end",
  CURRENT_TIMESTAMP,
  ps."created_at",
  ps."updated_at"
FROM "provider_subscriptions" ps
WHERE ps."target_type" <> 'instance'
  AND NOT EXISTS (
  SELECT 1
  FROM "entitlements" e
  WHERE e."source" = 'cloud_subscription'
    AND e."subject_id" = CASE
      WHEN ps."provider" = 'stripe'::"Provider" THEN ps."external_subscription_id"
      ELSE ps."id"
    END
)
ON CONFLICT DO NOTHING;

INSERT INTO "entitlements" (
  "id", "target_type", "target_id", "source", "plan", "status",
  "subject_id", "metadata", "validated_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  'user',
  f."user_id",
  'admin_grant',
  CASE f."name"
    WHEN 'pro_plan_v1' THEN 'pro'
    WHEN 'lifetime_pro_plan_v1' THEN 'lifetime_pro'
    WHEN 'unlimited_copilot' THEN 'ai'
    ELSE 'free'
  END,
  'active',
  'legacy_user_feature:' || f."id"::text,
  jsonb_build_object('legacyFeature', f."name"),
  CURRENT_TIMESTAMP,
  f."created_at",
  CURRENT_TIMESTAMP
FROM "user_features" f
WHERE f."activated"
  AND (f."expired_at" IS NULL OR f."expired_at" > CURRENT_TIMESTAMP)
  AND f."name" IN ('free_plan_v1', 'pro_plan_v1', 'lifetime_pro_plan_v1', 'unlimited_copilot')
  AND NOT EXISTS (
    SELECT 1 FROM "entitlements" e
    WHERE e."target_type" = 'user'
      AND e."target_id" = f."user_id"
      AND e."plan" = CASE f."name"
        WHEN 'pro_plan_v1' THEN 'pro'
        WHEN 'lifetime_pro_plan_v1' THEN 'lifetime_pro'
        WHEN 'unlimited_copilot' THEN 'ai'
        ELSE 'free'
      END
      AND e."status" IN ('active', 'grace')
  )
ON CONFLICT DO NOTHING;

INSERT INTO "entitlements" (
  "id", "target_type", "target_id", "source", "plan", "status",
  "subject_id", "quantity", "metadata", "validated_at", "created_at", "updated_at"
)
SELECT
  gen_random_uuid()::text,
  'workspace',
  f."workspace_id",
  'admin_grant',
  'team',
  'active',
  'legacy_workspace_feature:' || f."id"::text,
  GREATEST(COALESCE((f."configs" ->> 'memberLimit')::integer, 1), 1),
  jsonb_build_object('legacyFeature', f."name"),
  CURRENT_TIMESTAMP,
  f."created_at",
  CURRENT_TIMESTAMP
FROM "workspace_features" f
WHERE f."activated"
  AND (f."expired_at" IS NULL OR f."expired_at" > CURRENT_TIMESTAMP)
  AND f."name" = 'team_plan_v1'
  AND NOT EXISTS (
    SELECT 1 FROM "entitlements" e
    WHERE e."target_type" = 'workspace'
      AND e."target_id" = f."workspace_id"
      AND e."plan" = 'team'
      AND e."status" IN ('active', 'grace')
  )
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  member_conflicts BIGINT;
  invitation_conflicts BIGINT;
  workspace_policy_conflicts BIGINT;
  doc_policy_conflicts BIGINT;
  doc_grant_conflicts BIGINT;
  runtime_conflicts BIGINT;
  subscription_conflicts BIGINT;
  missing_members BIGINT;
  missing_invitations BIGINT;
  missing_workspace_policies BIGINT;
  missing_doc_policies BIGINT;
  missing_doc_grants BIGINT;
  missing_runtime_states BIGINT;
  missing_provider_subscriptions BIGINT;
  missing_cloud_entitlements BIGINT;
BEGIN
  SELECT COUNT(*) INTO member_conflicts
  FROM "workspace_user_permissions" p
  JOIN "workspace_members" m
    ON m."workspace_id" = p."workspace_id"
   AND m."user_id" = p."user_id"
   AND m."state" = 'active'
  WHERE p."status" = 'Accepted'::"WorkspaceMemberStatus"
    AND affine_permission_legacy_workspace_role(p."type") IS DISTINCT FROM m."role";

  SELECT COUNT(*) INTO invitation_conflicts
  FROM "workspace_user_permissions" p
  JOIN "workspace_invitations" i
    ON i."workspace_id" = p."workspace_id"
   AND i."invitee_user_id" = p."user_id"
  WHERE p."status" <> 'Accepted'::"WorkspaceMemberStatus"
    AND (
      affine_permission_workspace_invitation_state(p."status") IS DISTINCT FROM i."status"
      OR CASE affine_permission_legacy_workspace_role(p."type")
        WHEN 'admin' THEN 'admin'
        ELSE 'member'
      END IS DISTINCT FROM i."requested_role"
    );

  SELECT COUNT(*) INTO workspace_policy_conflicts
  FROM "workspaces" w
  JOIN "workspace_access_policies" p ON p."workspace_id" = w."id"
  WHERE p."visibility" IS DISTINCT FROM CASE WHEN w."public" THEN 'public' ELSE 'private' END
    OR p."sharing_enabled" IS DISTINCT FROM w."enable_sharing"
    OR p."url_preview_enabled" IS DISTINCT FROM w."enable_url_preview";

  SELECT COUNT(*) INTO doc_policy_conflicts
  FROM "workspace_pages" d
  JOIN "doc_access_policies" p
    ON p."workspace_id" = d."workspace_id" AND p."doc_id" = d."page_id"
  WHERE p."visibility" IS DISTINCT FROM CASE WHEN d."public" THEN 'public' ELSE 'private' END
    OR p."member_default_role" IS DISTINCT FROM affine_permission_legacy_default_doc_role(d."defaultRole");

  SELECT COUNT(*) INTO doc_grant_conflicts
  FROM "workspace_page_user_permissions" d
  JOIN "doc_grants" g
    ON g."workspace_id" = d."workspace_id"
   AND g."doc_id" = d."page_id"
   AND g."principal_type" = 'user'
   AND g."principal_id" = d."user_id"
  WHERE affine_permission_legacy_doc_role(d."type") IS DISTINCT FROM g."role";

  SELECT COUNT(*) INTO runtime_conflicts
  FROM "workspace_runtime_states" r
  JOIN "effective_workspace_quota_states" q ON q."workspace_id" = r."workspace_id"
  WHERE q."readonly" IS DISTINCT FROM r."readonly"
    OR q."readonly_reasons" IS DISTINCT FROM r."readonly_reasons";

  SELECT COUNT(*) INTO subscription_conflicts
  FROM "subscriptions" s
  JOIN "provider_subscriptions" ps
    ON ps."provider" = s."provider"
   AND (
     (
       s."provider" = 'stripe'::"Provider"
       AND ps."external_subscription_id" = COALESCE(
         s."stripe_subscription_id",
         'legacy_subscription:' || s."id"::text
       )
     )
     OR (
       s."provider" = 'revenuecat'::"Provider"
       AND ps."iap_store" = COALESCE(s."iap_store", 'app_store'::"IapStore")
       AND ps."external_ref" = COALESCE(
         s."rc_external_ref",
         'legacy_subscription:' || s."id"::text
       )
       AND ps."external_product_id" = COALESCE(
         s."rc_product_id",
         'legacy_product:' || s."id"::text
       )
       AND ps."external_customer_id" = s."target_id"
     )
   )
  WHERE ps."status" IS DISTINCT FROM s."status";

  SELECT COUNT(*) INTO missing_members
  FROM "workspace_user_permissions" p
  WHERE p."status" = 'Accepted'::"WorkspaceMemberStatus"
    AND affine_permission_legacy_workspace_role(p."type") IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "workspace_members" m
      WHERE m."workspace_id" = p."workspace_id"
        AND m."user_id" = p."user_id"
        AND m."state" = 'active'
    );

  SELECT COUNT(*) INTO missing_invitations
  FROM "workspace_user_permissions" p
  WHERE p."status" <> 'Accepted'::"WorkspaceMemberStatus"
    AND affine_permission_legacy_workspace_role(p."type") IS NOT NULL
    AND affine_permission_workspace_invitation_state(p."status") IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "workspace_invitations" i
      WHERE i."workspace_id" = p."workspace_id"
        AND i."invitee_user_id" = p."user_id"
    );

  SELECT COUNT(*) INTO missing_workspace_policies
  FROM "workspaces" w
  WHERE NOT EXISTS (
    SELECT 1 FROM "workspace_access_policies" p
    WHERE p."workspace_id" = w."id"
  );

  SELECT COUNT(*) INTO missing_doc_policies
  FROM "workspace_pages" d
  WHERE NOT EXISTS (
    SELECT 1 FROM "doc_access_policies" p
    WHERE p."workspace_id" = d."workspace_id"
      AND p."doc_id" = d."page_id"
  );

  SELECT COUNT(*) INTO missing_doc_grants
  FROM "workspace_page_user_permissions" d
  WHERE affine_permission_legacy_doc_role(d."type") IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM "doc_grants" g
      WHERE g."workspace_id" = d."workspace_id"
        AND g."doc_id" = d."page_id"
        AND g."principal_type" = 'user'
        AND g."principal_id" = d."user_id"
    );

  SELECT COUNT(*) INTO missing_runtime_states
  FROM "workspace_runtime_states" r
  WHERE NOT EXISTS (
    SELECT 1 FROM "effective_workspace_quota_states" q
    WHERE q."workspace_id" = r."workspace_id"
  );

  SELECT COUNT(*) INTO missing_provider_subscriptions
  FROM "subscriptions" s
  WHERE NOT EXISTS (
    SELECT 1 FROM "provider_subscriptions" ps
    WHERE ps."provider" = s."provider"
      AND (
        (
          s."provider" = 'stripe'::"Provider"
          AND ps."external_subscription_id" = COALESCE(
            s."stripe_subscription_id",
            'legacy_subscription:' || s."id"::text
          )
        )
        OR (
          s."provider" = 'revenuecat'::"Provider"
          AND ps."iap_store" = COALESCE(s."iap_store", 'app_store'::"IapStore")
          AND ps."external_ref" = COALESCE(
            s."rc_external_ref",
            'legacy_subscription:' || s."id"::text
          )
          AND ps."external_product_id" = COALESCE(
            s."rc_product_id",
            'legacy_product:' || s."id"::text
          )
          AND ps."external_customer_id" = s."target_id"
        )
      )
  );

  SELECT COUNT(*) INTO missing_cloud_entitlements
  FROM "provider_subscriptions" ps
  WHERE ps."target_type" <> 'instance'
    AND NOT EXISTS (
      SELECT 1 FROM "entitlements" e
      WHERE e."source" = 'cloud_subscription'
        AND e."subject_id" = CASE
          WHEN ps."provider" = 'stripe'::"Provider" THEN ps."external_subscription_id"
          ELSE ps."id"
        END
    );

  RAISE NOTICE 'final legacy backfill retained new-table values for member=% invitation=% workspace_policy=% doc_policy=% doc_grant=% runtime=% subscription=% conflicts',
    member_conflicts,
    invitation_conflicts,
    workspace_policy_conflicts,
    doc_policy_conflicts,
    doc_grant_conflicts,
    runtime_conflicts,
    subscription_conflicts;

  IF missing_members + missing_invitations + missing_workspace_policies
    + missing_doc_policies + missing_doc_grants + missing_runtime_states
    + missing_provider_subscriptions + missing_cloud_entitlements > 0 THEN
    RAISE EXCEPTION 'legacy backfill incomplete: member=% invitation=% workspace_policy=% doc_policy=% doc_grant=% runtime=% provider_subscription=% cloud_entitlement=% missing facts',
      missing_members,
      missing_invitations,
      missing_workspace_policies,
      missing_doc_policies,
      missing_doc_grants,
      missing_runtime_states,
      missing_provider_subscriptions,
      missing_cloud_entitlements;
  END IF;
END
$$;
