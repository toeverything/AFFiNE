-- CreateTable
CREATE TABLE "workspace_runtime_states" (
    "workspace_id" VARCHAR NOT NULL,
    "known" BOOLEAN NOT NULL DEFAULT false,
    "readonly" BOOLEAN NOT NULL DEFAULT false,
    "readonly_reasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "last_reconciled_at" TIMESTAMPTZ(3),
    "stale_after" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_runtime_states_pkey" PRIMARY KEY ("workspace_id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" VARCHAR NOT NULL DEFAULT ('perm_' || md5(random()::text || clock_timestamp()::text)),
    "workspace_id" VARCHAR NOT NULL,
    "user_id" VARCHAR NOT NULL,
    "role" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'active',
    "source" TEXT NOT NULL DEFAULT 'legacy',
    "legacy_permission_id" VARCHAR,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_members_role_check" CHECK ("role" IN ('owner', 'admin', 'member')),
    CONSTRAINT "workspace_members_state_check" CHECK ("state" IN ('active', 'suspended', 'left')),
    CONSTRAINT "workspace_members_source_check" CHECK ("source" IN ('legacy', 'email', 'link', 'system'))
);

-- CreateTable
CREATE TABLE "workspace_invitations" (
    "id" VARCHAR NOT NULL DEFAULT ('perm_' || md5(random()::text || clock_timestamp()::text)),
    "workspace_id" VARCHAR NOT NULL,
    "invitee_user_id" VARCHAR,
    "normalized_email" VARCHAR,
    "inviter_user_id" VARCHAR,
    "requested_role" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'email',
    "token_hash" TEXT,
    "legacy_permission_id" VARCHAR,
    "expires_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workspace_invitations_requested_role_check" CHECK ("requested_role" IN ('admin', 'member')),
    CONSTRAINT "workspace_invitations_status_check" CHECK ("status" IN ('pending', 'waiting_review', 'waiting_seat', 'accepted', 'declined', 'revoked', 'expired')),
    CONSTRAINT "workspace_invitations_kind_check" CHECK ("kind" IN ('email', 'link')),
    CONSTRAINT "workspace_invitations_invitee_check" CHECK ("invitee_user_id" IS NOT NULL OR "normalized_email" IS NOT NULL OR "kind" = 'link')
);

-- CreateTable
CREATE TABLE "workspace_access_policies" (
    "workspace_id" VARCHAR NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "sharing_enabled" BOOLEAN NOT NULL DEFAULT true,
    "url_preview_enabled" BOOLEAN NOT NULL DEFAULT false,
    "member_default_doc_role" TEXT NOT NULL DEFAULT 'manager',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_access_policies_pkey" PRIMARY KEY ("workspace_id"),
    CONSTRAINT "workspace_access_policies_visibility_check" CHECK ("visibility" IN ('private', 'public')),
    CONSTRAINT "workspace_access_policies_member_default_doc_role_check" CHECK ("member_default_doc_role" IN ('none', 'reader', 'commenter', 'editor', 'manager'))
);

-- CreateTable
CREATE TABLE "doc_access_policies" (
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "public_role" TEXT,
    "member_default_role" TEXT,
    "url_preview_enabled" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_access_policies_pkey" PRIMARY KEY ("workspace_id", "doc_id"),
    CONSTRAINT "doc_access_policies_visibility_check" CHECK ("visibility" IN ('private', 'public')),
    CONSTRAINT "doc_access_policies_public_role_check" CHECK ("public_role" IS NULL OR "public_role" = 'external'),
    CONSTRAINT "doc_access_policies_member_default_role_check" CHECK ("member_default_role" IS NULL OR "member_default_role" IN ('none', 'reader', 'commenter', 'editor', 'manager')),
    CONSTRAINT "doc_access_policies_public_consistency_check" CHECK (
        ("visibility" = 'public' AND "public_role" IS NOT NULL) OR
        ("visibility" = 'private' AND "public_role" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "doc_grants" (
    "workspace_id" VARCHAR NOT NULL,
    "doc_id" VARCHAR NOT NULL,
    "principal_type" TEXT NOT NULL,
    "principal_id" VARCHAR NOT NULL,
    "role" TEXT NOT NULL,
    "granted_by" VARCHAR,
    "legacy_workspace_id" VARCHAR,
    "legacy_doc_id" VARCHAR,
    "legacy_user_id" VARCHAR,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doc_grants_pkey" PRIMARY KEY ("workspace_id", "doc_id", "principal_type", "principal_id"),
    CONSTRAINT "doc_grants_principal_type_check" CHECK ("principal_type" IN ('user', 'group')),
    CONSTRAINT "doc_grants_role_check" CHECK ("role" IN ('owner', 'manager', 'editor', 'commenter', 'reader'))
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_active_owner_key" ON "workspace_members"("workspace_id") WHERE "role" = 'owner' AND "state" = 'active';

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_active_user_key" ON "workspace_members"("workspace_id", "user_id") WHERE "state" = 'active';

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_legacy_permission_id_key" ON "workspace_members"("legacy_permission_id") WHERE "legacy_permission_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "workspace_members_user_id_state_idx" ON "workspace_members"("user_id", "state");

-- CreateIndex
CREATE INDEX "workspace_members_workspace_id_role_state_idx" ON "workspace_members"("workspace_id", "role", "state");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_state_key" ON "workspace_members"("workspace_id", "user_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invitations_legacy_permission_id_key" ON "workspace_invitations"("legacy_permission_id") WHERE "legacy_permission_id" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invitations_token_hash_key" ON "workspace_invitations"("token_hash") WHERE "token_hash" IS NOT NULL;

-- CreateIndex
CREATE INDEX "workspace_invitations_workspace_id_status_idx" ON "workspace_invitations"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "workspace_invitations_invitee_user_id_status_idx" ON "workspace_invitations"("invitee_user_id", "status");

-- CreateIndex
CREATE INDEX "workspace_invitations_workspace_id_normalized_email_status_idx" ON "workspace_invitations"("workspace_id", "normalized_email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_invitations_workspace_id_invitee_user_id_key" ON "workspace_invitations"("workspace_id", "invitee_user_id");

-- CreateIndex
CREATE INDEX "workspace_access_policies_visibility_idx" ON "workspace_access_policies"("visibility");

-- CreateIndex
CREATE INDEX "workspace_access_policies_url_preview_enabled_sharing_enabl_idx" ON "workspace_access_policies"("url_preview_enabled", "sharing_enabled");

-- CreateIndex
CREATE INDEX "doc_access_policies_public_idx" ON "doc_access_policies"("workspace_id", "visibility", "published_at") WHERE "visibility" = 'public';

-- CreateIndex
CREATE INDEX "doc_access_policies_workspace_id_doc_id_idx" ON "doc_access_policies"("workspace_id", "doc_id");

-- CreateIndex
CREATE UNIQUE INDEX "doc_grants_owner_key" ON "doc_grants"("workspace_id", "doc_id") WHERE "principal_type" = 'user' AND "role" = 'owner';

-- CreateIndex
CREATE UNIQUE INDEX "doc_grants_legacy_key" ON "doc_grants"("legacy_workspace_id", "legacy_doc_id", "legacy_user_id") WHERE "legacy_workspace_id" IS NOT NULL AND "legacy_doc_id" IS NOT NULL AND "legacy_user_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "doc_grants_principal_type_principal_id_role_idx" ON "doc_grants"("principal_type", "principal_id", "role");

-- CreateIndex
CREATE INDEX "doc_grants_workspace_id_doc_id_role_idx" ON "doc_grants"("workspace_id", "doc_id", "role");

-- AddForeignKey
ALTER TABLE "workspace_runtime_states" ADD CONSTRAINT "workspace_runtime_states_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_invitee_user_id_fkey" FOREIGN KEY ("invitee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitations" ADD CONSTRAINT "workspace_invitations_inviter_user_id_fkey" FOREIGN KEY ("inviter_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_access_policies" ADD CONSTRAINT "workspace_access_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_access_policies" ADD CONSTRAINT "doc_access_policies_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_grants" ADD CONSTRAINT "doc_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Role mapping helpers used by projection/backfill SQL. They return NULL for
-- legacy dirty data so callers can reject or report the row explicitly.
CREATE OR REPLACE FUNCTION affine_permission_legacy_workspace_role(role_value INTEGER)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE role_value
    WHEN 99 THEN 'owner'
    WHEN 10 THEN 'admin'
    WHEN 1 THEN 'member'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION affine_permission_legacy_doc_role(role_value INTEGER)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE role_value
    WHEN 99 THEN 'owner'
    WHEN 30 THEN 'manager'
    WHEN 20 THEN 'editor'
    WHEN 15 THEN 'commenter'
    WHEN 10 THEN 'reader'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION affine_permission_legacy_default_doc_role(role_value INTEGER)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE role_value
    WHEN 30 THEN 'manager'
    WHEN 20 THEN 'editor'
    WHEN 15 THEN 'commenter'
    WHEN 10 THEN 'reader'
    WHEN -32768 THEN 'none'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION affine_permission_workspace_invitation_state(status_value "WorkspaceMemberStatus")
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE status_value
    WHEN 'Pending'::"WorkspaceMemberStatus" THEN 'pending'
    WHEN 'UnderReview'::"WorkspaceMemberStatus" THEN 'waiting_review'
    WHEN 'AllocatingSeat'::"WorkspaceMemberStatus" THEN 'waiting_seat'
    WHEN 'NeedMoreSeat'::"WorkspaceMemberStatus" THEN 'waiting_seat'
    WHEN 'NeedMoreSeatAndReview'::"WorkspaceMemberStatus" THEN 'waiting_seat'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION affine_permission_projection_enabled()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT COALESCE(current_setting('affine.permission_projection.enabled', true), 'on') = 'on'
$$;

CREATE OR REPLACE FUNCTION affine_permission_sync_origin()
RETURNS TEXT
LANGUAGE SQL
STABLE
AS $$
  SELECT NULLIF(current_setting('affine.permission_sync_origin', true), '')
$$;

CREATE OR REPLACE FUNCTION affine_permission_should_project_from_legacy()
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  origin TEXT;
BEGIN
  IF NOT affine_permission_projection_enabled() THEN
    RETURN FALSE;
  END IF;

  origin := affine_permission_sync_origin();
  IF origin IS NULL THEN
    PERFORM set_config('affine.permission_sync_origin', 'legacy', true);
    RETURN TRUE;
  END IF;

  IF origin = 'legacy' THEN
    RETURN TRUE;
  END IF;

  IF origin = 'new' THEN
    RETURN FALSE;
  END IF;

  RAISE EXCEPTION 'Invalid affine.permission_sync_origin %', origin;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_should_project_from_new()
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  origin TEXT;
BEGIN
  IF NOT affine_permission_projection_enabled() THEN
    RETURN FALSE;
  END IF;

  origin := affine_permission_sync_origin();
  IF origin IS NULL THEN
    PERFORM set_config('affine.permission_sync_origin', 'new', true);
    RETURN TRUE;
  END IF;

  IF origin = 'new' THEN
    RETURN TRUE;
  END IF;

  IF origin = 'legacy' THEN
    RETURN FALSE;
  END IF;

  RAISE EXCEPTION 'Invalid affine.permission_sync_origin %', origin;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_new_workspace_role(role_value TEXT)
RETURNS SMALLINT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE role_value
    WHEN 'owner' THEN 99::SMALLINT
    WHEN 'admin' THEN 10::SMALLINT
    WHEN 'member' THEN 1::SMALLINT
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION affine_permission_new_workspace_source(source_value TEXT)
RETURNS "WorkspaceMemberSource"
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE source_value
    WHEN 'email' THEN 'Email'::"WorkspaceMemberSource"
    WHEN 'link' THEN 'Link'::"WorkspaceMemberSource"
    ELSE 'Email'::"WorkspaceMemberSource"
  END
$$;

CREATE OR REPLACE FUNCTION affine_permission_new_invitation_status(state_value TEXT)
RETURNS "WorkspaceMemberStatus"
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE state_value
    WHEN 'pending' THEN 'Pending'::"WorkspaceMemberStatus"
    WHEN 'waiting_review' THEN 'UnderReview'::"WorkspaceMemberStatus"
    WHEN 'waiting_seat' THEN 'NeedMoreSeat'::"WorkspaceMemberStatus"
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION affine_permission_new_doc_role(role_value TEXT)
RETURNS SMALLINT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE role_value
    WHEN 'owner' THEN 99::SMALLINT
    WHEN 'manager' THEN 30::SMALLINT
    WHEN 'editor' THEN 20::SMALLINT
    WHEN 'commenter' THEN 15::SMALLINT
    WHEN 'reader' THEN 10::SMALLINT
    WHEN 'external' THEN 0::SMALLINT
    WHEN 'none' THEN (-32767 - 1)::SMALLINT
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION affine_permission_projection_error_category(
  sql_state TEXT,
  message TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN sql_state = '23505' AND (
      message LIKE '%workspace_members_active_owner_key%' OR
      message LIKE '%doc_grants_owner_key%'
    ) THEN 'owner_conflict'
    WHEN sql_state = '23503' THEN 'foreign_key_missing'
    WHEN sql_state = 'P0001' AND message LIKE 'Cannot project unknown%' THEN 'invalid_legacy_role'
    WHEN message LIKE '%affine.permission_sync_origin%' THEN 'projection_recursion_guard_missing'
    ELSE 'unknown'
  END
$$;

CREATE OR REPLACE FUNCTION affine_permission_lock_workspace(workspace_id VARCHAR)
RETURNS VOID
LANGUAGE SQL
VOLATILE
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(workspace_id, 16))
$$;

CREATE OR REPLACE FUNCTION affine_permission_lock_doc(workspace_id VARCHAR, doc_id VARCHAR)
RETURNS VOID
LANGUAGE SQL
VOLATILE
AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(workspace_id || ':' || doc_id, 16))
$$;

CREATE OR REPLACE FUNCTION affine_permission_project_workspace_user_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  projected_role TEXT;
  projected_state TEXT;
  projected_source TEXT;
BEGIN
  IF NOT affine_permission_should_project_from_legacy() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM workspace_members WHERE legacy_permission_id = OLD.id;
    DELETE FROM workspace_invitations WHERE legacy_permission_id = OLD.id;
    RETURN OLD;
  END IF;

  projected_role := affine_permission_legacy_workspace_role(NEW.type);
  projected_source := CASE NEW.source
    WHEN 'Email'::"WorkspaceMemberSource" THEN 'email'
    WHEN 'Link'::"WorkspaceMemberSource" THEN 'link'
    ELSE 'legacy'
  END;

  IF NEW.type = -99 THEN
    DELETE FROM workspace_members WHERE legacy_permission_id = NEW.id;
    DELETE FROM workspace_invitations WHERE legacy_permission_id = NEW.id;
    RETURN NEW;
  END IF;

  IF NEW.status = 'Accepted'::"WorkspaceMemberStatus" THEN
    IF projected_role IS NULL THEN
      RAISE EXCEPTION 'Cannot project unknown workspace role % for workspace permission %', NEW.type, NEW.id;
    END IF;

    DELETE FROM workspace_invitations WHERE legacy_permission_id = NEW.id;
    INSERT INTO workspace_members (
      workspace_id,
      user_id,
      role,
      state,
      source,
      legacy_permission_id,
      created_at,
      updated_at
    )
    VALUES (
      NEW.workspace_id,
      NEW.user_id,
      projected_role,
      'active',
      projected_source,
      NEW.id,
      NEW.created_at,
      NEW.updated_at
    )
    ON CONFLICT ("legacy_permission_id") WHERE "legacy_permission_id" IS NOT NULL
    DO UPDATE SET
      user_id = EXCLUDED.user_id,
      role = EXCLUDED.role,
      state = EXCLUDED.state,
      source = EXCLUDED.source,
      updated_at = EXCLUDED.updated_at;

    RETURN NEW;
  END IF;

  projected_state := affine_permission_workspace_invitation_state(NEW.status);
  IF projected_state IS NULL THEN
    RETURN NEW;
  END IF;

  IF projected_role IS NULL THEN
    RAISE EXCEPTION 'Cannot project unknown workspace role % for %.%', NEW.type, NEW.workspace_id, NEW.user_id;
  END IF;

  DELETE FROM workspace_members WHERE legacy_permission_id = NEW.id;
  INSERT INTO workspace_invitations (
    workspace_id,
    invitee_user_id,
    inviter_user_id,
    requested_role,
    status,
    kind,
    legacy_permission_id,
    created_at,
    updated_at
  )
  VALUES (
    NEW.workspace_id,
    NEW.user_id,
    NEW.inviter_id,
    CASE WHEN projected_role = 'admin' THEN 'admin' ELSE 'member' END,
    projected_state,
    CASE WHEN projected_source = 'link' THEN 'link' ELSE 'email' END,
    NEW.id,
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT ("legacy_permission_id") WHERE "legacy_permission_id" IS NOT NULL
  DO UPDATE SET
    invitee_user_id = EXCLUDED.invitee_user_id,
    inviter_user_id = EXCLUDED.inviter_user_id,
    requested_role = EXCLUDED.requested_role,
    status = EXCLUDED.status,
    kind = EXCLUDED.kind,
    updated_at = EXCLUDED.updated_at;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'permission_projection_error:%:%', affine_permission_projection_error_category(SQLSTATE, SQLERRM), SQLERRM;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_project_workspace_page()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  default_role TEXT;
BEGIN
  IF NOT affine_permission_should_project_from_legacy() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM doc_access_policies
    WHERE workspace_id = OLD.workspace_id AND doc_id = OLD.page_id;
    RETURN OLD;
  END IF;

  default_role := affine_permission_legacy_default_doc_role(NEW."defaultRole");
  IF default_role IS NULL THEN
    RAISE EXCEPTION 'Cannot project unknown default doc role % for %.%', NEW."defaultRole", NEW.workspace_id, NEW.page_id;
  END IF;

  INSERT INTO doc_access_policies (
    workspace_id,
    doc_id,
    visibility,
    public_role,
    member_default_role,
    published_at,
    updated_at
  )
  VALUES (
    NEW.workspace_id,
    NEW.page_id,
    CASE WHEN NEW.public THEN 'public' ELSE 'private' END,
    CASE WHEN NEW.public THEN 'external' ELSE NULL END,
    default_role,
    NEW.published_at,
    now()
  )
  ON CONFLICT (workspace_id, doc_id)
  DO UPDATE SET
    visibility = EXCLUDED.visibility,
    public_role = EXCLUDED.public_role,
    member_default_role = EXCLUDED.member_default_role,
    published_at = EXCLUDED.published_at,
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'permission_projection_error:%:%', affine_permission_projection_error_category(SQLSTATE, SQLERRM), SQLERRM;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_project_workspace_page_user_permission()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  projected_role TEXT;
BEGIN
  IF NOT affine_permission_should_project_from_legacy() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM doc_grants
    WHERE workspace_id = OLD.workspace_id
      AND doc_id = OLD.page_id
      AND principal_type = 'user'
      AND principal_id = OLD.user_id;
    RETURN OLD;
  END IF;

  IF NEW.type IN (-32768, 0) THEN
    DELETE FROM doc_grants
    WHERE workspace_id = NEW.workspace_id
      AND doc_id = NEW.page_id
      AND principal_type = 'user'
      AND principal_id = NEW.user_id;
    RETURN NEW;
  END IF;

  projected_role := affine_permission_legacy_doc_role(NEW.type);
  IF projected_role IS NULL THEN
    RAISE EXCEPTION 'Cannot project unknown doc role % for %.% user %', NEW.type, NEW.workspace_id, NEW.page_id, NEW.user_id;
  END IF;

  INSERT INTO doc_grants (
    workspace_id,
    doc_id,
    principal_type,
    principal_id,
    role,
    legacy_workspace_id,
    legacy_doc_id,
    legacy_user_id,
    created_at,
    updated_at
  )
  VALUES (
    NEW.workspace_id,
    NEW.page_id,
    'user',
    NEW.user_id,
    projected_role,
    NEW.workspace_id,
    NEW.page_id,
    NEW.user_id,
    NEW.created_at,
    now()
  )
  ON CONFLICT (workspace_id, doc_id, principal_type, principal_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'permission_projection_error:%:%', affine_permission_projection_error_category(SQLSTATE, SQLERRM), SQLERRM;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_project_workspace_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT affine_permission_should_project_from_legacy() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM workspace_access_policies WHERE workspace_id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO workspace_access_policies (
    workspace_id,
    visibility,
    sharing_enabled,
    url_preview_enabled,
    updated_at
  )
  VALUES (
    NEW.id,
    CASE WHEN NEW.public THEN 'public' ELSE 'private' END,
    NEW.enable_sharing,
    NEW.enable_url_preview,
    now()
  )
  ON CONFLICT (workspace_id)
  DO UPDATE SET
    visibility = EXCLUDED.visibility,
    sharing_enabled = EXCLUDED.sharing_enabled,
    url_preview_enabled = EXCLUDED.url_preview_enabled,
    updated_at = now();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'permission_projection_error:%:%', affine_permission_projection_error_category(SQLSTATE, SQLERRM), SQLERRM;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_project_new_workspace_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  legacy_role SMALLINT;
  projected_legacy_id VARCHAR;
BEGIN
  IF NOT affine_permission_should_project_from_new() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    DELETE FROM workspace_user_permissions
    WHERE workspace_id = OLD.workspace_id AND user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  IF NEW.state <> 'active' THEN
    DELETE FROM workspace_user_permissions
    WHERE workspace_id = NEW.workspace_id AND user_id = NEW.user_id;
    RETURN NEW;
  END IF;

  legacy_role := affine_permission_new_workspace_role(NEW.role);
  IF legacy_role IS NULL THEN
    RAISE EXCEPTION 'Cannot project unknown workspace member role % for %.%', NEW.role, NEW.workspace_id, NEW.user_id;
  END IF;

  DELETE FROM workspace_invitations
  WHERE workspace_id = NEW.workspace_id AND invitee_user_id = NEW.user_id;

  INSERT INTO workspace_user_permissions (
    id,
    workspace_id,
    user_id,
    type,
    status,
    source,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(NEW.legacy_permission_id, 'perm_' || md5(random()::text || clock_timestamp()::text)),
    NEW.workspace_id,
    NEW.user_id,
    legacy_role,
    'Accepted'::"WorkspaceMemberStatus",
    affine_permission_new_workspace_source(NEW.source),
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    source = EXCLUDED.source,
    updated_at = EXCLUDED.updated_at
  RETURNING id INTO projected_legacy_id;

  IF NEW.legacy_permission_id IS DISTINCT FROM projected_legacy_id THEN
    PERFORM set_config('affine.permission_sync_origin', 'legacy', true);
    UPDATE workspace_members
    SET legacy_permission_id = projected_legacy_id
    WHERE id = NEW.id;
    PERFORM set_config('affine.permission_sync_origin', 'new', true);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'permission_projection_error:%:%', affine_permission_projection_error_category(SQLSTATE, SQLERRM), SQLERRM;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_project_new_workspace_invitation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  legacy_status "WorkspaceMemberStatus";
  legacy_role SMALLINT;
  projected_legacy_id VARCHAR;
BEGIN
  IF NOT affine_permission_should_project_from_new() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.invitee_user_id IS NULL THEN
      RETURN OLD;
    END IF;
    DELETE FROM workspace_user_permissions
    WHERE workspace_id = OLD.workspace_id
      AND user_id = OLD.invitee_user_id
      AND status <> 'Accepted'::"WorkspaceMemberStatus";
    RETURN OLD;
  END IF;

  IF NEW.invitee_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  legacy_status := affine_permission_new_invitation_status(NEW.status);
  legacy_role := CASE WHEN NEW.requested_role = 'admin' THEN 10::SMALLINT ELSE 1::SMALLINT END;
  IF legacy_status IS NULL THEN
    DELETE FROM workspace_user_permissions
    WHERE workspace_id = NEW.workspace_id
      AND user_id = NEW.invitee_user_id
      AND status <> 'Accepted'::"WorkspaceMemberStatus";
    RETURN NEW;
  END IF;

  DELETE FROM workspace_members
  WHERE workspace_id = NEW.workspace_id AND user_id = NEW.invitee_user_id AND state = 'active';

  INSERT INTO workspace_user_permissions (
    id,
    workspace_id,
    user_id,
    inviter_id,
    type,
    status,
    source,
    created_at,
    updated_at
  )
  VALUES (
    COALESCE(NEW.legacy_permission_id, 'perm_' || md5(random()::text || clock_timestamp()::text)),
    NEW.workspace_id,
    NEW.invitee_user_id,
    NEW.inviter_user_id,
    legacy_role,
    legacy_status,
    CASE WHEN NEW.kind = 'link' THEN 'Link'::"WorkspaceMemberSource" ELSE 'Email'::"WorkspaceMemberSource" END,
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    inviter_id = EXCLUDED.inviter_id,
    type = EXCLUDED.type,
    status = EXCLUDED.status,
    source = EXCLUDED.source,
    updated_at = EXCLUDED.updated_at
  RETURNING id INTO projected_legacy_id;

  IF NEW.legacy_permission_id IS DISTINCT FROM projected_legacy_id THEN
    PERFORM set_config('affine.permission_sync_origin', 'legacy', true);
    UPDATE workspace_invitations
    SET legacy_permission_id = projected_legacy_id
    WHERE id = NEW.id;
    PERFORM set_config('affine.permission_sync_origin', 'new', true);
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'permission_projection_error:%:%', affine_permission_projection_error_category(SQLSTATE, SQLERRM), SQLERRM;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_project_new_workspace_access_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT affine_permission_should_project_from_new() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  UPDATE workspaces
  SET
    public = NEW.visibility = 'public',
    enable_sharing = NEW.sharing_enabled,
    enable_url_preview = NEW.url_preview_enabled
  WHERE id = NEW.workspace_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'permission_projection_error:%:%', affine_permission_projection_error_category(SQLSTATE, SQLERRM), SQLERRM;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_project_new_doc_access_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  legacy_default_role SMALLINT;
BEGIN
  IF NOT affine_permission_should_project_from_new() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    legacy_default_role := affine_permission_new_doc_role(
      COALESCE(
        (SELECT member_default_doc_role FROM workspace_access_policies WHERE workspace_id = OLD.workspace_id),
        'manager'
      )
    );
    IF legacy_default_role IS NULL OR legacy_default_role = 99 THEN
      legacy_default_role := 30::SMALLINT;
    END IF;

    UPDATE workspace_pages
    SET
      public = FALSE,
      "defaultRole" = legacy_default_role,
      published_at = NULL
    WHERE workspace_id = OLD.workspace_id AND page_id = OLD.doc_id;
    RETURN OLD;
  END IF;

  legacy_default_role := affine_permission_new_doc_role(
    COALESCE(
      NEW.member_default_role,
      (SELECT member_default_doc_role FROM workspace_access_policies WHERE workspace_id = NEW.workspace_id),
      'manager'
    )
  );
  IF legacy_default_role IS NULL OR legacy_default_role = 99 THEN
    RAISE EXCEPTION 'Cannot project unsupported doc default role % for %.%', NEW.member_default_role, NEW.workspace_id, NEW.doc_id;
  END IF;

  INSERT INTO workspace_pages (
    workspace_id,
    page_id,
    public,
    "defaultRole",
    published_at
  )
  VALUES (
    NEW.workspace_id,
    NEW.doc_id,
    NEW.visibility = 'public',
    legacy_default_role,
    NEW.published_at
  )
  ON CONFLICT (workspace_id, page_id)
  DO UPDATE SET
    public = EXCLUDED.public,
    "defaultRole" = EXCLUDED."defaultRole",
    published_at = EXCLUDED.published_at;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'permission_projection_error:%:%', affine_permission_projection_error_category(SQLSTATE, SQLERRM), SQLERRM;
END
$$;

CREATE OR REPLACE FUNCTION affine_permission_project_new_doc_grant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  legacy_role SMALLINT;
BEGIN
  IF NOT affine_permission_should_project_from_new() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.principal_type <> 'user' THEN
      RETURN OLD;
    END IF;
    DELETE FROM workspace_page_user_permissions
    WHERE workspace_id = OLD.workspace_id
      AND page_id = OLD.doc_id
      AND user_id = OLD.principal_id;
    RETURN OLD;
  END IF;

  IF NEW.principal_type <> 'user' THEN
    RETURN NEW;
  END IF;

  legacy_role := affine_permission_new_doc_role(NEW.role);
  IF legacy_role IS NULL OR legacy_role IN (0, -32768) THEN
    RAISE EXCEPTION 'Cannot project unsupported doc grant role % for %.%', NEW.role, NEW.workspace_id, NEW.doc_id;
  END IF;

  INSERT INTO workspace_page_user_permissions (
    workspace_id,
    page_id,
    user_id,
    type,
    created_at
  )
  VALUES (
    NEW.workspace_id,
    NEW.doc_id,
    NEW.principal_id,
    legacy_role,
    NEW.created_at
  )
  ON CONFLICT (workspace_id, page_id, user_id)
  DO UPDATE SET
    type = EXCLUDED.type;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'permission_projection_error:%:%', affine_permission_projection_error_category(SQLSTATE, SQLERRM), SQLERRM;
END
$$;

CREATE TRIGGER "affine_permission_project_workspace_user_permission"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_user_permissions"
FOR EACH ROW EXECUTE FUNCTION affine_permission_project_workspace_user_permission();

CREATE TRIGGER "affine_permission_project_workspace_page"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_pages"
FOR EACH ROW EXECUTE FUNCTION affine_permission_project_workspace_page();

CREATE TRIGGER "affine_permission_project_workspace_page_user_permission"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_page_user_permissions"
FOR EACH ROW EXECUTE FUNCTION affine_permission_project_workspace_page_user_permission();

CREATE TRIGGER "affine_permission_project_workspace_policy"
AFTER INSERT OR UPDATE OR DELETE ON "workspaces"
FOR EACH ROW EXECUTE FUNCTION affine_permission_project_workspace_policy();

CREATE TRIGGER "affine_permission_project_new_workspace_member"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_members"
FOR EACH ROW EXECUTE FUNCTION affine_permission_project_new_workspace_member();

CREATE TRIGGER "affine_permission_project_new_workspace_invitation"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_invitations"
FOR EACH ROW EXECUTE FUNCTION affine_permission_project_new_workspace_invitation();

CREATE TRIGGER "affine_permission_project_new_workspace_access_policy"
AFTER INSERT OR UPDATE OR DELETE ON "workspace_access_policies"
FOR EACH ROW EXECUTE FUNCTION affine_permission_project_new_workspace_access_policy();

CREATE TRIGGER "affine_permission_project_new_doc_access_policy"
AFTER INSERT OR UPDATE OR DELETE ON "doc_access_policies"
FOR EACH ROW EXECUTE FUNCTION affine_permission_project_new_doc_access_policy();

CREATE TRIGGER "affine_permission_project_new_doc_grant"
AFTER INSERT OR UPDATE OR DELETE ON "doc_grants"
FOR EACH ROW EXECUTE FUNCTION affine_permission_project_new_doc_grant();
