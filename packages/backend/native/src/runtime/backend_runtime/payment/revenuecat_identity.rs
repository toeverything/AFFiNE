use sqlx::{PgPool, Row, postgres::PgRow};

use super::{RevenueCatClient, RevenueCatSubscription, RuntimeError, RuntimeResult};

pub(super) async fn resolve_revenuecat_identity(
  pool: &PgPool,
  client: &RevenueCatClient,
  subscription: &RevenueCatSubscription,
  store_product_id: &str,
) -> RuntimeResult<Option<PgRow>> {
  let namespace = client
    .namespace()
    .canonical_key()
    .map_err(|_| RuntimeError::invalid_state("invalid RevenueCat provider namespace"))?;
  let mut candidates = sqlx::query(
    "SELECT id,target_type,target_id,provider_namespace,source_identity,external_ref,external_customer_id FROM \
     provider_subscriptions WHERE provider='revenuecat' AND ((provider_namespace=$1 AND source_identity=$2) OR \
     external_subscription_id=$2 OR external_ref=$2 OR (iap_store::text=$3 AND external_product_id=$4 AND \
     external_ref=$5)) ORDER BY id",
  )
  .bind(&namespace)
  .bind(&subscription.id)
  .bind(&subscription.store)
  .bind(store_product_id)
  .bind(&subscription.store_subscription_identifier)
  .fetch_all(pool)
  .await
  .map_err(|error| RuntimeError::database("load RevenueCat source identity", error))?;
  let direct_ids = candidates
    .iter()
    .map(|row| row.get::<String, _>("id"))
    .collect::<Vec<_>>();
  let has_legacy: bool = sqlx::query_scalar(
    "SELECT EXISTS(SELECT 1 FROM provider_subscriptions WHERE provider='revenuecat' AND provider_namespace IS NULL \
     AND id<>ALL($1) AND ($2 OR (target_type='user' AND target_id=$3)))",
  )
  .bind(&direct_ids)
  .bind(candidates.is_empty())
  .bind(&subscription.customer_id)
  .fetch_one(pool)
  .await
  .map_err(|error| RuntimeError::database("check RevenueCat legacy source identities", error))?;
  if has_legacy {
    let customer_id = subscription
      .customer_id
      .as_deref()
      .ok_or_else(|| RuntimeError::invalid_input("RevenueCat source has no customer"))?;
    let mut aliases = client
      .customer_aliases(customer_id)
      .await
      .map_err(|error| RuntimeError::invalid_state(error.code))?
      .into_iter()
      .map(|alias| alias.id)
      .collect::<Vec<_>>();
    aliases.push(customer_id.to_string());
    candidates.extend(
      sqlx::query(
        "SELECT id,target_type,target_id,provider_namespace,source_identity,external_ref,external_customer_id FROM \
         provider_subscriptions WHERE provider='revenuecat' AND provider_namespace IS NULL AND id<>ALL($1) AND \
         target_type='user' AND target_id=ANY($2) ORDER BY id",
      )
      .bind(&direct_ids)
      .bind(&aliases)
      .fetch_all(pool)
      .await
      .map_err(|error| RuntimeError::database("load RevenueCat legacy store identities", error))?,
    );
  }
  let mut matched = None;
  for row in candidates {
    let external_ref: Option<String> = row.get("external_ref");
    let direct = direct_ids.contains(&row.get::<String, _>("id"));
    if !direct {
      let external_ref = external_ref
        .as_deref()
        .ok_or_else(|| RuntimeError::invalid_state("RevenueCat legacy source has no store identity"))?;
      let aliases = if let Some(source) = client
        .subscription_by_id(external_ref)
        .await
        .map_err(|error| RuntimeError::invalid_state(error.code))?
      {
        vec![source]
      } else {
        client
          .subscriptions_by_store_id(external_ref)
          .await
          .map_err(|error| RuntimeError::invalid_state(error.code))?
      };
      let same_source = aliases.iter().find(|candidate| candidate.id == subscription.id);
      if aliases.is_empty()
        || same_source.is_some_and(|candidate| {
          (candidate.customer_id != subscription.customer_id
            && !(candidate
              .customer_id
              .as_deref()
              .is_some_and(|customer| customer.starts_with("$RCAnonymousID:"))
              && candidate.customer_id == row.get::<Option<String>, _>("external_customer_id")
              && Some(row.get::<String, _>("target_id")) == subscription.customer_id))
            || candidate.product_id != subscription.product_id
            || candidate.store != subscription.store
            || candidate.environment != subscription.environment
        })
      {
        return Err(RuntimeError::invalid_state(
          "unverified RevenueCat legacy store identity",
        ));
      }
      if same_source.is_none() {
        continue;
      }
    }
    if matched.is_some()
      || row
        .get::<Option<String>, _>("provider_namespace")
        .is_some_and(|stored| stored != namespace)
    {
      return Err(RuntimeError::invalid_state("conflicting payment source identity"));
    }
    matched = Some(row);
  }
  Ok(matched)
}
