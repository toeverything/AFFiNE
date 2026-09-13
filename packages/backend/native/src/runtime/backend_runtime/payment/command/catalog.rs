use std::collections::BTreeMap;

use super::*;

struct CatalogPrice {
  lookup_key: &'static str,
  product: &'static str,
  unit_amount: i64,
  recurring: SubscriptionRecurring,
}

const CATALOG: [CatalogPrice; 8] = [
  CatalogPrice {
    lookup_key: "pro_monthly",
    product: "AFFiNE Pro",
    unit_amount: 799,
    recurring: SubscriptionRecurring::Monthly,
  },
  CatalogPrice {
    lookup_key: "pro_yearly",
    product: "AFFiNE Pro",
    unit_amount: 8100,
    recurring: SubscriptionRecurring::Yearly,
  },
  CatalogPrice {
    lookup_key: "pro_lifetime",
    product: "AFFiNE Pro Believer",
    unit_amount: 49900,
    recurring: SubscriptionRecurring::Lifetime,
  },
  CatalogPrice {
    lookup_key: "ai_yearly",
    product: "AFFiNE AI",
    unit_amount: 10680,
    recurring: SubscriptionRecurring::Yearly,
  },
  CatalogPrice {
    lookup_key: "team_monthly",
    product: "AFFiNE Team(per seat)",
    unit_amount: 1200,
    recurring: SubscriptionRecurring::Monthly,
  },
  CatalogPrice {
    lookup_key: "team_yearly",
    product: "AFFiNE Team(per seat)",
    unit_amount: 12000,
    recurring: SubscriptionRecurring::Yearly,
  },
  CatalogPrice {
    lookup_key: "selfhostedteam_monthly",
    product: "AFFiNE Self-hosted Team(per seat)",
    unit_amount: 1200,
    recurring: SubscriptionRecurring::Monthly,
  },
  CatalogPrice {
    lookup_key: "selfhostedteam_yearly",
    product: "AFFiNE Self-hosted Team(per seat)",
    unit_amount: 12000,
    recurring: SubscriptionRecurring::Yearly,
  },
];

impl PaymentRuntime {
  pub(super) async fn provision_stripe_catalog(
    &self,
    changes: &mut super::super::PaymentApplyResult,
  ) -> RuntimeResult<Value> {
    let stripe = self.stripe()?;
    let prices = stripe
      .list_all::<StripePrice>("v1/prices", &[("active", "true"), ("expand[]", "data.product")])
      .await
      .map_err(provider_runtime_error)?;
    let mut existing = BTreeMap::new();
    for price in prices {
      let Some(lookup_key) = price.lookup_key.clone() else {
        continue;
      };
      if existing.insert(lookup_key, price).is_some() {
        return Err(RuntimeError::invalid_state("duplicate Stripe catalog lookup key"));
      }
    }
    let namespace = stripe.namespace().clone();
    let namespace_key = canonical_namespace(&namespace)?;
    let mut results = Vec::with_capacity(CATALOG.len());
    for specification in &CATALOG {
      if let Some(price) = existing.get(specification.lookup_key) {
        validate_catalog_price(price, specification)?;
        results.push(catalog_result(price, false));
        continue;
      }
      let intent_id = format!("stripe-catalog-v1:{}", specification.lookup_key);
      let mut fields = vec![
        text_field("product_data[name]", specification.product),
        text_field("billing_scheme", "per_unit"),
        text_field("unit_amount", specification.unit_amount.to_string()),
        text_field("currency", "usd"),
        text_field("lookup_key", specification.lookup_key),
        text_field("tax_behavior", "inclusive"),
      ];
      if specification.recurring != SubscriptionRecurring::Lifetime {
        fields.extend([
          text_field(
            "recurring[interval]",
            if specification.recurring == SubscriptionRecurring::Monthly {
              "month"
            } else {
              "year"
            },
          ),
          text_field("recurring[interval_count]", "1"),
          text_field("recurring[usage_type]", "licensed"),
        ]);
      }
      let operation = stripe_operation(
        namespace.clone(),
        "provision_price",
        &intent_id,
        vec![PaymentScope::billing_target(
          &namespace_key,
          "catalog",
          specification.lookup_key,
        )?],
        None,
        "v1/prices",
        fields,
      );
      match self.execute_stripe_operation(operation).await? {
        OperationExecution::Completed(result) => results.push(result),
        OperationExecution::Sent {
          connection,
          operation_id,
          response,
        } => {
          let price: StripePrice = serde_json::from_value(response)
            .map_err(|error| RuntimeError::json("invalid provisioned Stripe price", error))?;
          validate_catalog_price(&price, specification)?;
          let result = catalog_result(&price, true);
          changes.extend(
            self
              .apply_with_connection(
                connection,
                empty_snapshot(namespace.clone(), None, operation_id, result.clone()),
              )
              .await?,
          );
          results.push(result);
        }
      }
    }
    Ok(json!({ "prices": results }))
  }

  pub(super) async fn refresh_revenuecat(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    user_id: &str,
  ) -> RuntimeResult<Value> {
    validate_identity(user_id, "RevenueCat user")?;
    let client = self
      .revenuecat
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
    let config = self
      .revenuecat_config
      .as_ref()
      .ok_or_else(|| RuntimeError::invalid_state("RevenueCat payment provider is not configured"))?;
    let subscriptions = client
      .customer_subscriptions(user_id)
      .await
      .map_err(provider_runtime_error)?;
    let verified =
      super::super::worker::verified_missing_revenuecat_sources(self, client, user_id, &subscriptions).await?;
    let snapshot = super::super::snapshot::revenuecat_customer_snapshot(
      &self.pool,
      client,
      config,
      user_id,
      subscriptions,
      SnapshotCoverage::Complete {
        verified_missing_revenuecat_sources: verified,
      },
      Vec::new(),
    )
    .await?;
    let count = snapshot.subscriptions.len();
    changes.extend(self.apply_snapshot(snapshot).await?);
    Ok(json!({ "status": "completed", "count": count }))
  }

  pub(super) async fn ensure_customer(
    &self,
    changes: &mut super::super::PaymentApplyResult,
    namespace: &ProviderNamespace,
    user_id: &str,
    email: Option<&str>,
    intent_id: &str,
  ) -> RuntimeResult<String> {
    validate_identity(user_id, "payment user")?;
    let namespace_key = canonical_namespace(namespace)?;
    if let Some(customer_id) = sqlx::query_scalar::<_, String>(
      "SELECT stripe_customer_id FROM user_stripe_customers WHERE user_id=$1 AND provider_namespace=$2",
    )
    .bind(user_id)
    .bind(&namespace_key)
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load Stripe customer", error))?
    {
      return Ok(customer_id);
    }
    let email = email
      .filter(|email| email.contains('@') && *email == email.trim())
      .ok_or_else(|| RuntimeError::invalid_input("payment user email is required"))?;
    let customer_intent = format!("{intent_id}:customer");
    let intent = stripe_operation(
      namespace.clone(),
      "create_customer",
      &customer_intent,
      vec![PaymentScope::billing_target(&namespace_key, "user", user_id)?],
      Some(("user", user_id)),
      "v1/customers",
      vec![
        text_field("email", email),
        text_field("metadata[affineUserId]", user_id),
      ],
    );
    match self.execute_stripe_operation(intent).await? {
      OperationExecution::Completed(result) => result
        .get("customerId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| RuntimeError::invalid_state("stored Stripe customer result is invalid")),
      OperationExecution::Sent {
        connection,
        operation_id,
        response,
      } => {
        let customer: StripeCustomer = serde_json::from_value(response)
          .map_err(|error| RuntimeError::json("invalid Stripe customer response", error))?;
        if !customer.matches_email(email) {
          return Err(RuntimeError::invalid_state(
            "Stripe customer response does not match request",
          ));
        }
        let result = json!({ "customerId": customer.id });
        let mut snapshot = empty_snapshot(
          namespace.clone(),
          Some(customer.id.clone()),
          operation_id,
          result.clone(),
        );
        snapshot.customers.push(CustomerSnapshot {
          user_id: user_id.to_string(),
          external_customer_id: customer.id.clone(),
        });
        changes.extend(self.apply_with_connection(connection, snapshot).await?);
        Ok(customer.id)
      }
    }
  }

  pub(super) async fn find_price(
    &self,
    lookup_key: &str,
    expected_recurring: SubscriptionRecurring,
  ) -> RuntimeResult<StripePrice> {
    let prices = self
      .stripe()?
      .list_all::<StripePrice>(
        "v1/prices",
        &[
          ("active", "true"),
          ("lookup_keys[]", lookup_key),
          ("expand[]", "data.product"),
        ],
      )
      .await
      .map_err(provider_runtime_error)?;
    match prices.as_slice() {
      [price]
        if price.active
          && price.lookup_key.as_deref() == Some(lookup_key)
          && price_recurring_matches(price, expected_recurring) =>
      {
        Ok(price.clone())
      }
      _ => Err(RuntimeError::invalid_state("subscription_plan_not_found")),
    }
  }

  pub(super) async fn resolve_coupon(&self, code: &str, customer_id: Option<&str>) -> RuntimeResult<Option<String>> {
    let promotions = self
      .stripe()?
      .list_all::<StripePromotionCode>(
        "v1/promotion_codes",
        &[("active", "true"), ("code", code), ("expand[]", "data.coupon")],
      )
      .await
      .map_err(provider_runtime_error)?;
    let Some(promotion) = promotions.into_iter().next() else {
      return Ok(None);
    };
    if !promotion.active
      || promotion
        .customer
        .as_ref()
        .is_some_and(|customer| Some(customer.id()) != customer_id)
    {
      return Ok(None);
    }
    Ok(Some(promotion.coupon.id().to_string()))
  }
}

fn validate_catalog_price(price: &StripePrice, specification: &CatalogPrice) -> RuntimeResult<()> {
  if !price.active
    || price.lookup_key.as_deref() != Some(specification.lookup_key)
    || price.unit_amount != Some(specification.unit_amount)
    || !price.currency.eq_ignore_ascii_case("usd")
    || !price_recurring_matches(price, specification.recurring)
  {
    return Err(RuntimeError::invalid_state(
      "Stripe catalog price does not match specification",
    ));
  }
  Ok(())
}

fn catalog_result(price: &StripePrice, created: bool) -> Value {
  json!({
    "priceId": price.id,
    "lookupKey": price.lookup_key,
    "created": created,
  })
}
