use affine_core::access_control::{
  InvitationKind, InvitationRole, InvitationStatus, QuotaUsage, SeatActivationFacts, SeatActivationRequest,
  SeatAuthority, SeatDenialReason, SeatMutationIntent, SeatOperationPlan, SeatReservationKind, SeatReviewFacts,
  SeatReviewRequest, WorkspaceAction, plan_seat_activation, plan_seat_review_reservation,
};
use napi::Result;
use uuid::Uuid;

use super::{
  super::{BackendRuntime, RuntimeError, napi_error, permission::PermissionAuthorizer},
  chargeable_invitation_statuses, invalidate_seat_usage,
};

async fn lock_users_in_order(
  tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
  user_ids: impl IntoIterator<Item = String>,
  context: &'static str,
) -> Result<()> {
  let mut user_ids = user_ids.into_iter().collect::<Vec<_>>();
  user_ids.sort();
  user_ids.dedup();
  for user_id in user_ids {
    sqlx::query("SELECT id FROM users WHERE id=$1 FOR UPDATE")
      .bind(user_id)
      .fetch_one(&mut **tx)
      .await
      .map_err(|error| RuntimeError::database(context, error))?;
  }
  Ok(())
}
use super::{load_decision_time, resolve_quota_charge};
use crate::runtime::types::{
  RuntimeSeatActivationInput, RuntimeSeatReservation, RuntimeSeatReservationDecision, RuntimeSeatReservationInput,
  RuntimeSeatReviewInput,
};

fn seat_denial(reason: SeatDenialReason) -> napi::Error {
  napi_error(match reason {
    SeatDenialReason::Forbidden => "workspace_users_manage_forbidden",
    SeatDenialReason::AccountMismatch => "workspace_invitation_account_mismatch",
    SeatDenialReason::Collision => "seat target already occupies workspace",
    SeatDenialReason::InvitationNotFound => "workspace_invitation_not_found",
    SeatDenialReason::InvitationNotActivatable => "workspace_invitation_not_activatable",
    SeatDenialReason::InvalidInvitation => "workspace_invitation_invalid",
    SeatDenialReason::SeatLimitExceeded { .. } => "seat_limit",
    SeatDenialReason::ArithmeticOverflow => "seat quota arithmetic overflow",
  })
}

#[napi_derive::napi]
impl BackendRuntime {
  #[napi]
  pub async fn reserve_workspace_review_seat_v1(&self, input: RuntimeSeatReviewInput) -> Result<bool> {
    let pool = self.pool().await?;
    let deployment = self.config()?.deployment;
    let mut tx = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("start strict review seat transaction", error))?;
    let owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(&input.workspace_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("locate strict review seat owner", error))?;
    lock_users_in_order(
      &mut tx,
      [owner_id.clone(), input.target_user_id.clone()],
      "lock strict review seat users",
    )
    .await?;
    sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
      .bind(&input.workspace_id)
      .fetch_one(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock strict review seat workspace", error))?;
    let locked_owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(&input.workspace_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("verify strict review seat owner", error))?;
    if locked_owner_id != owner_id {
      return Err(napi_error("seat quota subject changed"));
    }
    let chargeable_statuses = chargeable_invitation_statuses();
    let occupied: bool = sqlx::query_scalar(
      r#"SELECT EXISTS(
        SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active'
        UNION ALL
        SELECT 1 FROM workspace_invitations WHERE workspace_id=$1 AND invitee_user_id=$2
          AND status::text = ANY($3))"#,
    )
    .bind(&input.workspace_id)
    .bind(&input.target_user_id)
    .bind(chargeable_statuses.as_slice())
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("check strict review seat collision", error))?;
    let now = load_decision_time(&mut tx, "load strict review seat decision clock").await?;
    let subject = resolve_quota_charge(&mut tx, deployment, &input.workspace_id, owner_id, now).await?;
    let charged: i64 = sqlx::query_scalar(
      r#"SELECT
        (SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND state='active')
        + (SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1
          AND status::text = ANY($2))"#,
    )
    .bind(&input.workspace_id)
    .bind(chargeable_statuses.as_slice())
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("count strict review seats", error))?;
    let (status, kind, role) = match plan_seat_review_reservation(
      SeatReviewRequest {
        reservation: SeatReservationKind::ReviewLink,
        requested_seats: 1,
        collision: occupied,
        authority_allowed: true,
      },
      SeatReviewFacts {
        grant: subject.grant.clone(),
        usage: QuotaUsage {
          storage_bytes: 0,
          charged_seats: charged,
        },
      },
    ) {
      SeatOperationPlan::Mutate(SeatMutationIntent::Reserve {
        seat_delta: 1,
        status,
        kind,
        role,
      }) => (status, kind, role),
      SeatOperationPlan::Deny(SeatDenialReason::SeatLimitExceeded { .. }) => {
        self
          .permission_telemetry
          .quota_guard("seat", "reserve", "deny", "seat_limit");
        return Ok(false);
      }
      SeatOperationPlan::Deny(reason) => return Err(seat_denial(reason)),
      SeatOperationPlan::Mutate(_) => return Err(napi_error("invalid seat review plan")),
    };
    sqlx::query(
      r#"INSERT INTO workspace_invitations
        (id,workspace_id,invitee_user_id,inviter_user_id,requested_role,status,kind,created_at,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp(),clock_timestamp())"#,
    )
    .bind(Uuid::new_v4().to_string())
    .bind(&input.workspace_id)
    .bind(&input.target_user_id)
    .bind(&input.inviter_user_id)
    .bind(role.as_str())
    .bind(status.as_str())
    .bind(kind.as_str())
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("insert strict review seat", error))?;
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit strict review seat", error))?;
    invalidate_seat_usage(self, &input.workspace_id).await;
    self
      .permission_telemetry
      .quota_guard("seat", "reserve", "allow", "review_pending");
    Ok(true)
  }

  #[napi]
  pub async fn activate_workspace_seat_v1(&self, input: RuntimeSeatActivationInput) -> Result<bool> {
    let pool = self.pool().await?;
    let deployment = self.config()?.deployment;
    let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, self.permission_telemetry.clone());
    let mut tx = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("start strict seat activation", error))?;
    let owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(&input.workspace_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("locate strict seat activation owner", error))?;
    lock_users_in_order(
      &mut tx,
      [owner_id.clone(), input.target_user_id.clone()],
      "lock strict seat activation users",
    )
    .await?;
    sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
      .bind(&input.workspace_id)
      .fetch_one(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock strict seat activation workspace", error))?;
    let locked_owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(&input.workspace_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("verify strict seat activation owner", error))?;
    if locked_owner_id != owner_id {
      return Err(napi_error("seat quota subject changed"));
    }
    let manage_allowed = if input.require_manage_permission {
      authorizer
        .authorize_workspace_action_in(
          &mut tx,
          &input.workspace_id,
          Some(&input.actor_user_id),
          WorkspaceAction::UsersManage,
        )
        .await?
        .allowed
    } else {
      false
    };
    let invitation = sqlx::query(
      r#"SELECT id,requested_role::text AS requested_role,kind::text AS kind,status::text AS status
         FROM workspace_invitations WHERE workspace_id=$1 AND invitee_user_id=$2 FOR UPDATE"#,
    )
    .bind(&input.workspace_id)
    .bind(&input.target_user_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("load strict seat activation invitation", error))?
    .ok_or_else(|| RuntimeError::invalid_input("workspace_invitation_not_found"))?;
    let status: String = sqlx::Row::get(&invitation, "status");
    let now = load_decision_time(&mut tx, "load strict seat activation decision clock").await?;
    let subject = resolve_quota_charge(&mut tx, deployment, &input.workspace_id, owner_id, now).await?;
    let chargeable_statuses = chargeable_invitation_statuses();
    let charged: i64 = sqlx::query_scalar(
      r#"SELECT
        (SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND state='active')
        + (SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1
          AND status::text = ANY($2))"#,
    )
    .bind(&input.workspace_id)
    .bind(chargeable_statuses.as_slice())
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("count strict seat activation", error))?;
    let invitation_id: String = sqlx::Row::get(&invitation, "id");
    let requested_role: String = sqlx::Row::get(&invitation, "requested_role");
    let source: String = sqlx::Row::get(&invitation, "kind");
    let collision: bool = sqlx::query_scalar(
      "SELECT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active')",
    )
    .bind(&input.workspace_id)
    .bind(&input.target_user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("check strict seat activation collision", error))?;
    let (source, requested_role) = match plan_seat_activation(
      SeatActivationRequest {
        authority: if input.require_manage_permission {
          SeatAuthority::ManageMembers {
            allowed: manage_allowed,
          }
        } else {
          SeatAuthority::SelfActivation
        },
        actor_is_target: input.actor_user_id == input.target_user_id,
      },
      SeatActivationFacts {
        grant: subject.grant.clone(),
        usage: QuotaUsage {
          storage_bytes: 0,
          charged_seats: charged,
        },
        status: Some(InvitationStatus::parse(&status)),
        kind: InvitationKind::parse(&source),
        requested_role: InvitationRole::parse(&requested_role),
        collision,
      },
    ) {
      SeatOperationPlan::Mutate(SeatMutationIntent::Activate { kind, role, .. }) => (kind, role),
      SeatOperationPlan::Deny(reason) => return Err(seat_denial(reason)),
      SeatOperationPlan::Mutate(_) => return Err(napi_error("invalid seat activation plan")),
    };
    let inserted = sqlx::query(
      "INSERT INTO workspace_members (id,workspace_id,user_id,role,state,source,created_at,updated_at) VALUES \
       ($1,$2,$3,$4,'active',$5,clock_timestamp(),clock_timestamp()) ON CONFLICT (workspace_id,user_id,state) DO \
       NOTHING",
    )
    .bind(&invitation_id)
    .bind(&input.workspace_id)
    .bind(&input.target_user_id)
    .bind(requested_role.as_str())
    .bind(source.as_str())
    .execute(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("activate strict workspace seat", error))?;
    if inserted.rows_affected() != 1 {
      return Err(napi_error("workspace_member_conflict"));
    }
    let consumed = sqlx::query("DELETE FROM workspace_invitations WHERE id=$1")
      .bind(&invitation_id)
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("consume strict seat invitation", error))?;
    if consumed.rows_affected() != 1 {
      return Err(napi_error("workspace_invitation_changed"));
    }
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit strict seat activation", error))?;
    invalidate_seat_usage(self, &input.workspace_id).await;
    self
      .permission_telemetry
      .quota_guard("seat", "activate", "allow", "member_active");
    Ok(true)
  }

  #[napi]
  pub async fn reserve_workspace_seats_v1(
    &self,
    input: RuntimeSeatReservationInput,
  ) -> Result<RuntimeSeatReservationDecision> {
    if input.targets.is_empty() || input.targets.len() > 512 {
      return Err(napi_error("invalid seat reservation targets"));
    }
    let mut emails = input
      .targets
      .into_iter()
      .map(|target| target.email.trim().to_ascii_lowercase())
      .collect::<Vec<_>>();
    emails.sort();
    if emails.iter().any(|email| !email.contains('@')) || emails.windows(2).any(|pair| pair[0] == pair[1]) {
      return Err(napi_error("invalid or duplicate seat reservation target"));
    }

    let pool = self.pool().await?;
    let deployment = self.config()?.deployment;
    let authorizer = PermissionAuthorizer::with_telemetry(pool.clone(), deployment, self.permission_telemetry.clone());
    let mut tx = pool
      .begin()
      .await
      .map_err(|error| RuntimeError::database("start strict seat transaction", error))?;
    let owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(&input.workspace_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("locate strict seat owner", error))?;
    let mut targets = Vec::with_capacity(emails.len());
    for email in emails {
      sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,8301))")
        .bind(&email)
        .execute(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("lock strict seat email", error))?;
      let user_id = if let Some(user_id) = sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE lower(email)=$1")
        .bind(&email)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("resolve strict seat user", error))?
      {
        user_id
      } else {
        sqlx::query_scalar(
          r#"INSERT INTO users (id,name,email,registered,created_at)
            VALUES ($1,$2,$3,false,clock_timestamp()) RETURNING id"#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(email.split('@').next().unwrap_or("Invited user"))
        .bind(&email)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| RuntimeError::database("insert strict seat user", error))?
      };
      targets.push((email, user_id));
    }
    lock_users_in_order(
      &mut tx,
      std::iter::once(owner_id.clone()).chain(targets.iter().map(|(_, user_id)| user_id.clone())),
      "lock strict seat users",
    )
    .await?;
    sqlx::query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE")
      .bind(&input.workspace_id)
      .fetch_one(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("lock strict seat workspace", error))?;
    let locked_owner_id: String = sqlx::query_scalar(
      "SELECT user_id FROM workspace_members WHERE workspace_id=$1 AND role='owner' AND state='active' LIMIT 1",
    )
    .bind(&input.workspace_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("verify strict seat owner", error))?;
    if locked_owner_id != owner_id {
      return Err(napi_error("seat quota subject changed"));
    }
    let manage_allowed = authorizer
      .authorize_workspace_action_in(
        &mut tx,
        &input.workspace_id,
        Some(&input.actor_user_id),
        WorkspaceAction::UsersManage,
      )
      .await?
      .allowed;
    let now = load_decision_time(&mut tx, "load strict seat decision clock").await?;
    let subject = resolve_quota_charge(&mut tx, deployment, &input.workspace_id, owner_id, now).await?;
    let chargeable_statuses = chargeable_invitation_statuses();
    let current: i64 = sqlx::query_scalar(
      r#"SELECT
        (SELECT count(*) FROM workspace_members WHERE workspace_id=$1 AND state='active')
        + (SELECT count(*) FROM workspace_invitations WHERE workspace_id=$1
          AND status::text = ANY($2))"#,
    )
    .bind(&input.workspace_id)
    .bind(chargeable_statuses.as_slice())
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| RuntimeError::database("count strict seats", error))?;
    let mut occupied = false;
    for (email, user_id) in &targets {
      occupied = sqlx::query_scalar(
        r#"SELECT EXISTS(
          SELECT 1 FROM workspace_members WHERE workspace_id=$1 AND user_id=$2 AND state='active'
          UNION ALL
          SELECT 1 FROM workspace_invitations WHERE workspace_id=$1
            AND (invitee_user_id=$2 OR normalized_email=$3)
            AND status::text = ANY($4))"#,
      )
      .bind(&input.workspace_id)
      .bind(user_id)
      .bind(email)
      .bind(chargeable_statuses.as_slice())
      .fetch_one(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("check strict seat collision", error))?;
      if occupied {
        break;
      }
    }
    let requested = i64::try_from(targets.len()).unwrap_or(i64::MAX);
    let (status, kind, role) = match plan_seat_review_reservation(
      SeatReviewRequest {
        reservation: SeatReservationKind::EmailInvite,
        requested_seats: requested,
        collision: occupied,
        authority_allowed: manage_allowed,
      },
      SeatReviewFacts {
        grant: subject.grant.clone(),
        usage: QuotaUsage {
          storage_bytes: 0,
          charged_seats: current,
        },
      },
    ) {
      SeatOperationPlan::Mutate(SeatMutationIntent::Reserve {
        seat_delta,
        status,
        kind,
        role,
      }) if seat_delta == requested => (status, kind, role),
      SeatOperationPlan::Deny(SeatDenialReason::SeatLimitExceeded { .. }) => {
        self
          .permission_telemetry
          .quota_guard("seat", "reserve", "deny", "seat_limit");
        return Ok(RuntimeSeatReservationDecision {
          allowed: false,
          reason: Some("seat_limit".to_string()),
          limit: subject.grant.limits.seat_limit,
          current: i32::try_from(current).unwrap_or(i32::MAX),
          reservations: Vec::new(),
        });
      }
      SeatOperationPlan::Deny(reason) => return Err(seat_denial(reason)),
      SeatOperationPlan::Mutate(_) => return Err(napi_error("invalid seat reservation plan")),
    };

    let mut reservations = Vec::with_capacity(targets.len());
    for (email, user_id) in targets {
      let invitation_id = Uuid::new_v4().to_string();
      sqlx::query(
        r#"INSERT INTO workspace_invitations
          (id,workspace_id,invitee_user_id,normalized_email,inviter_user_id,requested_role,status,kind,created_at,updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),clock_timestamp())"#,
      )
      .bind(&invitation_id)
      .bind(&input.workspace_id)
      .bind(&user_id)
      .bind(&email)
      .bind(&input.actor_user_id)
      .bind(role.as_str())
      .bind(status.as_str())
      .bind(kind.as_str())
      .execute(&mut *tx)
      .await
      .map_err(|error| RuntimeError::database("insert strict seat reservation", error))?;
      reservations.push(RuntimeSeatReservation {
        invitation_id,
        user_id,
        email,
        status: "pending".to_string(),
      });
    }
    tx.commit()
      .await
      .map_err(|error| RuntimeError::database("commit strict seat reservation", error))?;
    invalidate_seat_usage(self, &input.workspace_id).await;
    self
      .permission_telemetry
      .quota_guard("seat", "reserve", "allow", "charged_pending");
    Ok(RuntimeSeatReservationDecision {
      allowed: true,
      reason: None,
      limit: subject.grant.limits.seat_limit,
      current: i32::try_from(current).unwrap_or(i32::MAX),
      reservations,
    })
  }
}
