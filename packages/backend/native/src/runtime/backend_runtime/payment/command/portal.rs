use super::*;

impl PaymentRuntime {
  pub(in crate::runtime::backend_runtime) async fn customer_portal_url(
    &self,
    actor_user_id: &str,
  ) -> RuntimeResult<String> {
    validate_identity(actor_user_id, "payment actor")?;
    let stripe = self.stripe()?;
    let namespace_key = canonical_namespace(stripe.namespace())?;
    let customer_id: String = sqlx::query_scalar(
      "SELECT stripe_customer_id FROM user_stripe_customers WHERE user_id=$1 AND provider_namespace=$2",
    )
    .bind(actor_user_id)
    .bind(&namespace_key)
    .fetch_optional(&self.pool)
    .await
    .map_err(|error| RuntimeError::database("load Stripe portal customer", error))?
    .ok_or_else(|| RuntimeError::invalid_state("payment_customer_not_found"))?;
    let mut form = StripeForm::default();
    form.push("customer", StripeFormValue::Text(customer_id));
    let portal: StripePortalSession = stripe
      .post("v1/billing_portal/sessions", &form, &uuid::Uuid::new_v4().to_string())
      .await
      .map_err(provider_runtime_error)?;
    Ok(portal.url)
  }
}
