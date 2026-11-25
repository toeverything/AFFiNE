//! Public-domain implementation of [`server_spi::DomainDispositionHandler`].

use std::collections::BTreeSet;
use std::sync::Arc;

use server_db::{ServerDb, WorkloadTier};
use server_spi::{BillingInvoiceRecord, BillingSpi, DomainDispositionHandler, QuotaGate};
use server_types::DomainError;
use sqlx::Row;

use crate::auth::AuthService;
use crate::users::UserService;

#[derive(Clone)]
pub struct DefaultDomainDispositionHandler {
  db: ServerDb,
  auth: AuthService,
  users: UserService,
  quota_gate: Arc<dyn QuotaGate>,
  billing_spi: Arc<dyn BillingSpi>,
}

impl DefaultDomainDispositionHandler {
  pub fn new(
    db: ServerDb,
    auth: AuthService,
    users: UserService,
    quota_gate: Arc<dyn QuotaGate>,
    billing_spi: Arc<dyn BillingSpi>,
  ) -> Self {
    Self {
      db,
      auth,
      users,
      quota_gate,
      billing_spi,
    }
  }

  async fn cancel_mail_where(&self, column: &str, value: &str, reason: &str) -> Result<u64, DomainError> {
    let sql = format!(
      "UPDATE mail_deliveries \
       SET status = 'canceled', \
           canceled_at = now(), \
           settled_at = now(), \
           locked_by = NULL, \
           locked_until = NULL, \
           recipient_email = NULL, \
           payload = NULL, \
           retention_state = 'anonymized', \
           anonymized_at = now(), \
           last_error_code = $1, \
           updated_at = now() \
       WHERE status IN ('queued', 'retry_wait', 'sending') \
         AND {column} = $2"
    );
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire cancel_mail_{column}: {e}")))?;
    let res = sqlx::query(&sql)
      .bind(reason)
      .bind(value)
      .execute(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("cancel mail deliveries by {column}: {e}")))?;
    Ok(res.rows_affected())
  }

  async fn cancel_pending_invitations_where(&self, column: &str, value: &str) -> Result<Vec<String>, DomainError> {
    let sql = format!(
      "DELETE FROM workspace_invitations \
       WHERE {column} = $1 \
         AND status IN ('pending', 'waiting_review', 'waiting_seat') \
       RETURNING workspace_id"
    );
    let mut conn = self
      .db
      .acquire_tiered(WorkloadTier::InteractiveWrite)
      .await
      .map_err(|e| DomainError::Internal(format!("acquire cancel_invitations_{column}: {e}")))?;
    let rows: Vec<String> = sqlx::query_scalar(&sql)
      .bind(value)
      .fetch_all(&mut *conn)
      .await
      .map_err(|e| DomainError::Internal(format!("cancel pending invitations by {column}: {e}")))?;
    let unique: BTreeSet<String> = rows.into_iter().collect();
    Ok(unique.into_iter().collect())
  }
}

#[async_trait::async_trait]
impl DomainDispositionHandler for DefaultDomainDispositionHandler {
  async fn cancel_mail_by_actor(&self, actor_user_id: &str, reason: &str) -> Result<u64, DomainError> {
    self.cancel_mail_where("actor_user_id", actor_user_id, reason).await
  }

  async fn cancel_mail_by_workspace(&self, workspace_id: &str, reason: &str) -> Result<u64, DomainError> {
    self.cancel_mail_where("workspace_id", workspace_id, reason).await
  }

  async fn cancel_mail_by_abuse_subject(&self, subject_key: &str, reason: &str) -> Result<u64, DomainError> {
    self.cancel_mail_where("abuse_subject_key", subject_key, reason).await
  }

  async fn cancel_pending_invitations_by_actor(&self, actor_user_id: &str) -> Result<Vec<String>, DomainError> {
    self
      .cancel_pending_invitations_where("inviter_user_id", actor_user_id)
      .await
  }

  async fn cancel_pending_invitations_by_workspace(&self, workspace_id: &str) -> Result<Vec<String>, DomainError> {
    self
      .cancel_pending_invitations_where("workspace_id", workspace_id)
      .await
  }

  async fn ban_and_recreate_actor(&self, actor_user_id: &str) -> Result<String, DomainError> {
    let result = match self
      .users
      .ban_user(actor_user_id, self.quota_gate.as_ref(), self.billing_spi.as_ref())
      .await
    {
      Ok(res) => res,
      Err(err) if matches!(&err.error, DomainError::NotFound(code) if code == "user_not_found") => {
        let exists: bool = {
          let mut conn = self
            .db
            .acquire_tiered(WorkloadTier::InteractiveRead)
            .await
            .map_err(|e| DomainError::Internal(format!("acquire ban_and_recreate_actor check: {e}")))?;
          sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = $1)")
            .bind(actor_user_id)
            .fetch_one(&mut *conn)
            .await
            .map_err(|e| DomainError::Internal(format!("check banned actor existence: {e}")))?
        };
        if !exists {
          self.auth.revoke_all_user_sessions(actor_user_id, "abuse_ban").await?;
          return Ok(String::new());
        }
        return Err(err.error);
      }
      Err(err) => return Err(err.error),
    };
    self.auth.revoke_all_user_sessions(actor_user_id, "abuse_ban").await?;
    self
      .auth
      .revoke_all_user_sessions(&result.new_user.id, "abuse_ban")
      .await?;
    Ok(result.new_user.id)
  }

  async fn revoke_actor_sessions(&self, actor_user_id: &str, reason: &str) -> Result<(), DomainError> {
    self.auth.revoke_all_user_sessions(actor_user_id, reason).await
  }
}

/// Counts rows in `public.invoices` for a user or workspace target.
pub async fn count_invoices_by_target(db: &ServerDb, target_id: &str) -> Result<i64, DomainError> {
  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveRead)
    .await
    .map_err(|e| DomainError::Internal(format!("acquire count_invoices_by_target: {e}")))?;
  sqlx::query_scalar("SELECT COUNT(*)::bigint FROM invoices WHERE target_id = $1")
    .bind(target_id)
    .fetch_one(&mut *conn)
    .await
    .map_err(|e| DomainError::Internal(format!("count invoices: {e}")))
}

/// Lists rows from `public.invoices` ordered newest-first, matching `v0.27.5`
/// pagination (`skip >= 0`, `take >= 0`, `take == 0` -> empty).
pub async fn list_invoices_by_target(
  db: &ServerDb,
  target_id: &str,
  skip: Option<i64>,
  take: i64,
) -> Result<Vec<BillingInvoiceRecord>, DomainError> {
  let offset = skip.unwrap_or(0);
  if offset < 0 || take < 0 {
    return Err(DomainError::Validation(
      "invoice pagination requires skip >= 0 and take >= 0".to_owned(),
    ));
  }
  if take == 0 {
    return Ok(Vec::new());
  }
  let mut conn = db
    .acquire_tiered(WorkloadTier::InteractiveRead)
    .await
    .map_err(|e| DomainError::Internal(format!("acquire list_invoices_by_target: {e}")))?;
  let rows = sqlx::query(
    "SELECT currency, amount, status, COALESCE(reason, '') AS reason, \
            last_payment_error, link, created_at, updated_at \
     FROM invoices \
     WHERE target_id = $1 \
     ORDER BY created_at DESC \
     OFFSET $2 LIMIT $3",
  )
  .bind(target_id)
  .bind(offset)
  .bind(take)
  .fetch_all(&mut *conn)
  .await
  .map_err(|e| DomainError::Internal(format!("list invoices: {e}")))?;
  Ok(
    rows
      .into_iter()
      .map(|row| BillingInvoiceRecord {
        currency: row.get("currency"),
        amount: row.get("amount"),
        status: row.get("status"),
        reason: row.get("reason"),
        last_payment_error: row.get("last_payment_error"),
        link: row.get("link"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
      })
      .collect(),
  )
}

#[cfg(test)]
mod tests {
  use std::sync::{Arc, Mutex};

  use chrono::Utc;
  use server_db::{DbConfig, ServerDb, phase_a_compat::sessions::PhaseASessionRepository};
  use server_spi::{
    BillingSpi, CommunityBillingSpi, CommunityQuotaGate, CommunitySessionPolicyHook, DomainDispositionHandler,
  };
  use server_types::{DomainError, ServerRole};

  use super::DefaultDomainDispositionHandler;
  use crate::auth::{AuthConfig, AuthService};
  use crate::users::UserService;

  struct LeaseGuard(Option<(test_db_harness::pg::PgCluster, test_db_harness::pg::DbLease)>);

  impl Drop for LeaseGuard {
    fn drop(&mut self) {
      if let Some(inner) = self.0.take() {
        let _ = std::thread::spawn(move || drop(inner)).join();
      }
    }
  }

  async fn setup_db() -> (LeaseGuard, ServerDb) {
    let (cluster, lease) = tokio::task::spawn_blocking(|| {
      let cluster = test_db_harness::pg::PgCluster::from_env_or_docker().expect("PG16 test cluster");
      let migrations = test_db_harness::migrations::MigrationSet::from_migrations(Vec::new());
      let template = cluster.ensure_template(&migrations).expect("ensure template");
      let lease = cluster
        .lease(&template, test_db_harness::pg::DEFAULT_LEASE_TTL)
        .expect("lease db");
      (cluster, lease)
    })
    .await
    .expect("join harness");
    let db_url = lease.url().to_owned();
    let guard = LeaseGuard(Some((cluster, lease)));
    let prep = sqlx::postgres::PgPoolOptions::new()
      .max_connections(1)
      .connect(&db_url)
      .await
      .expect("prep connect");
    sqlx::query("DROP TABLE IF EXISTS \"_prisma_migrations\"")
      .execute(&prep)
      .await
      .expect("drop _prisma_migrations");
    prep.close().await;

    let db = ServerDb::connect(DbConfig {
      database_url: db_url,
      channel: "stable".to_owned(),
      role: ServerRole::Worker,
      selfhosted: false,
      max_connections: 1,
      statement_timeout_ms: 5_000,
      tier_permits: [1, 1, 1, 1],
    })
    .await
    .expect("connect server db");
    db.ensure_schema_ready().await.expect("ensure schema");
    (guard, db)
  }

  struct FailingPreDeleteBilling {
    err: Mutex<Option<DomainError>>,
  }

  #[async_trait::async_trait]
  impl BillingSpi for FailingPreDeleteBilling {
    async fn on_pre_delete_user(&self, _user_id: &str) -> Result<(), DomainError> {
      if let Some(e) = self.err.lock().unwrap().take() {
        return Err(e);
      }
      Ok(())
    }
  }

  #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
  async fn ban_and_recreate_actor_distinguishes_replay_from_downstream_not_found() {
    let (_guard, db) = setup_db().await;
    let now = Utc::now();
    sqlx::query(
      "INSERT INTO users (id, name, email, registered, disabled, email_verified, created_at) \
       VALUES ('u_replay', 'Replay', 'replay@example.com', true, false, $1, $1), \
              ('u_still_here', 'StillHere', 'still@example.com', true, false, $1, $1)",
    )
    .bind(now)
    .execute(db.pool())
    .await
    .unwrap();

    let auth = AuthService::new(
      db.clone(),
      Arc::new(PhaseASessionRepository),
      Arc::new(CommunitySessionPolicyHook),
      AuthConfig {
        private_key: "test-private-key-for-disposition-tests".to_owned(),
        ..AuthConfig::default()
      },
    );
    let users = UserService::new(db.clone());
    let quota_gate: Arc<dyn server_spi::QuotaGate> = Arc::new(CommunityQuotaGate::new());

    // 1. Real double-replay: first ban recreates disabled tombstone, second returns Ok("").
    let ok_handler = DefaultDomainDispositionHandler::new(
      db.clone(),
      auth.clone(),
      users.clone(),
      Arc::clone(&quota_gate),
      Arc::new(CommunityBillingSpi),
    );
    let new_id = ok_handler.ban_and_recreate_actor("u_replay").await.expect("first ban");
    assert!(!new_id.is_empty());
    let replay_res = ok_handler
      .ban_and_recreate_actor("u_replay")
      .await
      .expect("second ban replay must be idempotent");
    assert!(replay_res.is_empty());

    // 2. Downstream BillingSpi NotFound while user still exists must NOT be swallowed.
    for code in ["sub_not_found", "user_not_found"] {
      let failing_billing = Arc::new(FailingPreDeleteBilling {
        err: Mutex::new(Some(DomainError::NotFound(code.to_owned()))),
      });
      let err_handler = DefaultDomainDispositionHandler::new(
        db.clone(),
        auth.clone(),
        users.clone(),
        Arc::clone(&quota_gate),
        failing_billing,
      );
      let res = err_handler.ban_and_recreate_actor("u_still_here").await;
      assert!(
        matches!(res, Err(DomainError::NotFound(ref msg)) if msg == code),
        "expected NotFound({code}), got {res:?}"
      );
      let still_exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM users WHERE id = 'u_still_here')")
        .fetch_one(db.pool())
        .await
        .unwrap();
      assert!(still_exists, "u_still_here must remain in users when pre-delete fails");
    }

    db.pool().close().await;
  }
}
