use super::{
  license::{RuntimeLicenseInstallInput, RuntimeLicenseRefreshInput},
  *,
};
use crate::runtime::{backend_runtime::tests::runtime_from_database_url, migrations::DATABASE_TEST_LOCK};

pub(super) async fn fixture(runtime: &BackendRuntime) -> (String, String) {
  let owner = uuid::Uuid::new_v4().to_string();
  let workspace = uuid::Uuid::new_v4().to_string();
  let pool = runtime.pool().await.unwrap();
  sqlx::query("INSERT INTO users(id,email,name) VALUES($1,$2,'Entitlement Test')")
    .bind(&owner)
    .bind(format!("{owner}@example.com"))
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspaces(id) VALUES($1)")
    .bind(&workspace)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("INSERT INTO workspace_members(id,workspace_id,user_id,role,state) VALUES($1,$2,$3,'owner','active')")
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&workspace)
    .bind(&owner)
    .execute(&pool)
    .await
    .unwrap();
  (owner, workspace)
}

#[tokio::test]
async fn license_install_revoke_rollback_and_stale_fences() {
  let _guard = DATABASE_TEST_LOCK.lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping PostgreSQL test: DATABASE_URL not set");
    return;
  };
  std::sync::Arc::get_mut(&mut runtime.config.write().unwrap())
    .unwrap()
    .deployment = Deployment::SelfHosted;
  let pool = runtime.pool().await.unwrap();
  let (_, workspace) = fixture(&runtime).await;
  let (payload, _) = crate::entitlement::signed_test_license(&workspace);
  let key = format!("license:{workspace}");
  let input = || RuntimeLicenseInstallInput {
    workspace_id: workspace.clone(),
    license: payload.clone().into(),
    key: Some(key.clone()),
    validate_key: "generation".into(),
    recurring: "monthly".into(),
    activation: true,
  };
  let installed = runtime.install_license_v1(input()).await.unwrap();
  assert_eq!(installed.quantity, 10);
  let mut corrupt = payload.clone();
  corrupt[0] ^= 1;
  sqlx::query("UPDATE entitlements SET signed_payload=$2 WHERE subject_id=$1")
    .bind(&key)
    .bind(&corrupt)
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    !runtime
      .get_byok_entitlement_v1(workspace.clone(), None)
      .await
      .unwrap()
      .server
  );
  let status: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE subject_id=$1")
    .bind(&key)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(status, "active");
  assert!(
    runtime
      .refresh_license_v1(RuntimeLicenseRefreshInput {
        workspace_id: workspace.clone(),
        key: key.clone(),
        expected_validate_key: "generation".into(),
        validate_key: "generation".into(),
        recurring: "monthly".into(),
        license: payload.clone().into(),
        onetime: false,
      })
      .await
      .unwrap()
      .is_some()
  );
  let (other_identity, _) =
    crate::entitlement::signed_test_license_with_id(&workspace, &format!("other-license:{workspace}"));
  let identity_error = match runtime
    .refresh_license_v1(RuntimeLicenseRefreshInput {
      workspace_id: workspace.clone(),
      key: key.clone(),
      expected_validate_key: "generation".into(),
      validate_key: "other-generation".into(),
      recurring: "monthly".into(),
      license: other_identity.into(),
      onetime: false,
    })
    .await
  {
    Err(error) => error,
    Ok(_) => panic!("license refresh accepted a different signed identity"),
  };
  assert!(identity_error.to_string().contains("license_identity_changed"));
  let identity_after_rejection: (String, String) = sqlx::query_as(
    "SELECT i.validate_key,e.subject_id FROM installed_licenses i JOIN entitlements e ON e.target_type='workspace' \
     AND e.target_id=i.workspace_id AND e.source='selfhost_license' AND e.status='active' WHERE i.workspace_id=$1",
  )
  .bind(&workspace)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(identity_after_rejection, ("generation".into(), key.clone()));

  let (_, one_time_workspace) = fixture(&runtime).await;
  let (one_time_payload, _) = crate::entitlement::signed_test_license(&one_time_workspace);
  runtime
    .install_team_license_file_v1(one_time_workspace.clone(), one_time_payload.into())
    .await
    .unwrap();
  sqlx::query("UPDATE installed_licenses SET validated_at=clock_timestamp()-INTERVAL '2 hours' WHERE workspace_id=$1")
    .bind(&one_time_workspace)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "CREATE OR REPLACE FUNCTION rfc11_fail_onetime_refresh() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE \
     EXCEPTION 'injected one-time refresh failure'; END $$",
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(&format!(
    "CREATE TRIGGER rfc11_fail_onetime_refresh BEFORE UPDATE ON installed_licenses FOR EACH ROW WHEN \
     (OLD.workspace_id='{}') EXECUTE FUNCTION rfc11_fail_onetime_refresh()",
    one_time_workspace
  ))
  .execute(&pool)
  .await
  .unwrap();
  let one_time_refresh = runtime.check_licenses_v1().await;
  sqlx::query("DROP TRIGGER rfc11_fail_onetime_refresh ON installed_licenses")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION rfc11_fail_onetime_refresh()")
    .execute(&pool)
    .await
    .unwrap();
  assert!(one_time_refresh.unwrap().transient_failure);
  let one_time_retained: bool =
    sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM installed_licenses WHERE workspace_id=$1)")
      .bind(&one_time_workspace)
      .fetch_one(&pool)
      .await
      .unwrap();
  assert!(one_time_retained);
  let stale = RuntimeLicenseRefreshInput {
    workspace_id: workspace.clone(),
    key: key.clone(),
    expected_validate_key: "stale".into(),
    validate_key: "stale-result".into(),
    recurring: "yearly".into(),
    license: payload.clone().into(),
    onetime: false,
  };
  assert!(runtime.refresh_license_v1(stale).await.unwrap().is_none());
  assert!(
    !runtime
      .revoke_installed_license_v1(workspace.clone(), key.clone(), "stale".into())
      .await
      .unwrap()
  );
  let (admin, _) = fixture(&runtime).await;
  sqlx::query("INSERT INTO workspace_members(id,workspace_id,user_id,role,state) VALUES($1,$2,$3,'admin','active')")
    .bind(uuid::Uuid::new_v4().to_string())
    .bind(&workspace)
    .bind(&admin)
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query(
    "INSERT INTO workspace_invitations(id,workspace_id,normalized_email,status) \
     VALUES($1,$2,'license-rollback@example.com','pending')",
  )
  .bind(uuid::Uuid::new_v4().to_string())
  .bind(&workspace)
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "CREATE OR REPLACE FUNCTION rfc11_fail_demotion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION \
     'injected demotion failure'; END $$",
  )
  .execute(&pool)
  .await
  .unwrap();
  sqlx::query(
    "CREATE TRIGGER rfc11_fail_demotion BEFORE UPDATE ON workspace_members FOR EACH ROW WHEN (OLD.role='admin' AND \
     NEW.role='member') EXECUTE FUNCTION rfc11_fail_demotion()",
  )
  .execute(&pool)
  .await
  .unwrap();
  let rejected = runtime
    .revoke_installed_license_v1(workspace.clone(), key.clone(), "generation".into())
    .await;
  sqlx::query("DROP TRIGGER rfc11_fail_demotion ON workspace_members")
    .execute(&pool)
    .await
    .unwrap();
  sqlx::query("DROP FUNCTION rfc11_fail_demotion()")
    .execute(&pool)
    .await
    .unwrap();
  assert!(rejected.unwrap_err().to_string().contains("injected demotion failure"));
  let retained: (i64, i64, String) = sqlx::query_as(
    "SELECT (SELECT count(*) FROM installed_licenses WHERE workspace_id=$1), (SELECT count(*) FROM \
     workspace_invitations WHERE workspace_id=$1), status FROM entitlements WHERE subject_id=$2",
  )
  .bind(&workspace)
  .bind(&key)
  .fetch_one(&pool)
  .await
  .unwrap();
  assert_eq!(retained, (1, 1, "active".into()));
  assert!(
    runtime
      .revoke_installed_license_v1(workspace.clone(), key.clone(), "generation".into())
      .await
      .unwrap()
  );
  let status: String = sqlx::query_scalar("SELECT status FROM entitlements WHERE subject_id=$1")
    .bind(&key)
    .fetch_one(&pool)
    .await
    .unwrap();
  assert_eq!(status, "revoked");
}

#[tokio::test]
async fn authoritative_byok_and_mixed_owner_storage_use_current_facts() {
  let _guard = DATABASE_TEST_LOCK.lock().await;
  let Some(runtime) = runtime_from_database_url().await.unwrap() else {
    eprintln!("skipping PostgreSQL test: DATABASE_URL not set");
    return;
  };
  let pool = runtime.pool().await.unwrap();
  let (owner, workspace) = fixture(&runtime).await;
  let (_, team) = fixture(&runtime).await;
  sqlx::query("UPDATE workspace_members SET user_id=$2 WHERE workspace_id=$1 AND role='owner'")
    .bind(&team)
    .bind(&owner)
    .execute(&pool)
    .await
    .unwrap();
  runtime
    .upsert_admin_grant_v1(RuntimeAdminGrantInput {
      target_type: "workspace".into(),
      target_id: team.clone(),
      plan: "team".into(),
      quantity: Some(serde_json::json!(10)),
    })
    .await
    .unwrap();
  for (id, size) in [(&workspace, 200i32), (&team, 130i32)] {
    sqlx::query(
      "INSERT INTO blobs(workspace_id,key,size,mime,status) VALUES($1,'fixture',$2,'text/plain','completed')",
    )
    .bind(id)
    .bind(size)
    .execute(&pool)
    .await
    .unwrap();
  }
  let mut tx = pool.begin().await.unwrap();
  lock_targets(
    &mut tx,
    &[RuntimeEntitlementTarget {
      target_type: "workspace".into(),
      target_id: workspace.clone(),
    }],
  )
  .await
  .unwrap();
  let now = load_decision_time(&mut tx, "test").await.unwrap();
  let subject = resolve_quota_charge(&mut tx, Deployment::Cloud, &workspace, owner.clone(), now)
    .await
    .unwrap();
  let used = super::super::strict_quota::storage_usage(&mut tx, &workspace, &subject, Deployment::Cloud, now)
    .await
    .unwrap();
  assert_eq!(used, 200);
  tx.commit().await.unwrap();
  assert!(
    !runtime
      .get_byok_entitlement_v1(workspace.clone(), Some(owner.clone()))
      .await
      .unwrap()
      .local
  );
  runtime
    .upsert_admin_grant_v1(RuntimeAdminGrantInput {
      target_type: "user".into(),
      target_id: owner.clone(),
      plan: "ai".into(),
      quantity: None,
    })
    .await
    .unwrap();
  assert!(runtime.has_ai_entitlement_v1(owner.clone()).await.unwrap());
  let access = runtime
    .get_byok_entitlement_v1(workspace.clone(), Some(owner.clone()))
    .await
    .unwrap();
  assert!(access.local && access.server);
  assert!(
    !runtime
      .get_byok_entitlement_v1("missing".into(), Some(owner))
      .await
      .unwrap()
      .local
  );
  sqlx::query("DELETE FROM workspace_members WHERE workspace_id=$1 AND role='owner'")
    .bind(&workspace)
    .execute(&pool)
    .await
    .unwrap();
  assert!(
    runtime
      .get_byok_entitlement_v1(workspace, None)
      .await
      .unwrap_err()
      .to_string()
      .contains("workspace_owner_not_found")
  );
}
