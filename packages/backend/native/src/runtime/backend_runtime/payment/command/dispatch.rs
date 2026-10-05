use serde::Deserialize;

use super::*;

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", rename_all_fields = "camelCase")]
enum PaymentCommand {
  ProvisionStripeCatalog,
  ListPrices,
  ListSubscriptions {
    target_type: String,
    target_id: String,
  },
  ListInvoices {
    target_id: String,
  },
  CreateCheckout {
    actor_user_id: Option<String>,
    user_email: Option<String>,
    target_type: String,
    target_id: Option<String>,
    plan: String,
    recurring: String,
    variant: Option<String>,
    coupon: Option<String>,
    quantity: Option<u32>,
    success_url: String,
    intent_id: String,
  },
  MutateSubscription {
    actor_user_id: String,
    #[serde(flatten)]
    target: SubscriptionTarget,
    mutation: String,
    intent_id: String,
  },
  UpdateRecurring {
    actor_user_id: Option<String>,
    validate_key: Option<String>,
    #[serde(flatten)]
    target: SubscriptionTarget,
    recurring: String,
    intent_id: String,
  },
  UpdateQuantity {
    actor_user_id: Option<String>,
    validate_key: Option<String>,
    #[serde(flatten)]
    target: SubscriptionTarget,
    quantity: u32,
    intent_id: String,
  },
  RefreshRevenuecat {
    user_id: String,
  },
  RequestApplyRevenuecat {
    user_id: String,
    transaction_id: String,
    intent_id: String,
  },
  RevealLicense {
    session_id: String,
    intent_id: String,
  },
  ActivateLicense {
    license_key: String,
    workspace_id: String,
    operation_id: String,
  },
  DeactivateLicense {
    license_key: String,
    validate_key: String,
  },
  CheckLicenseHealth {
    license_key: String,
    validate_key: String,
    workspace_id: String,
  },
  ActivateLegacyLicense {
    license_key: String,
  },
  DeactivateLegacyLicense {
    license_key: String,
  },
  CheckLegacyLicenseHealth {
    license_key: String,
    validate_key: String,
  },
  PrepareUserDeletion {
    user_id: String,
  },
}

impl PaymentRuntime {
  pub(in crate::runtime::backend_runtime::payment) async fn execute(
    &self,
    input: Value,
  ) -> RuntimeResult<PaymentCommandOutcome> {
    let command: PaymentCommand =
      serde_json::from_value(input).map_err(|error| RuntimeError::json("invalid payment command", error))?;
    let _permit = self
      .permits
      .acquire()
      .await
      .map_err(|_| RuntimeError::invalid_state("payment runtime stopped"))?;
    let mut changes = super::super::PaymentApplyResult::default();
    let value = match command {
      PaymentCommand::ProvisionStripeCatalog => self.provision_stripe_catalog(&mut changes).await,
      PaymentCommand::ListPrices => self.list_prices().await,
      PaymentCommand::ListSubscriptions { target_type, target_id } => {
        self.list_subscriptions(&target_type, &target_id).await
      }
      PaymentCommand::ListInvoices { target_id } => self.list_invoices(&target_id).await,
      PaymentCommand::CreateCheckout {
        actor_user_id,
        user_email,
        target_type,
        target_id,
        plan,
        recurring,
        variant,
        coupon,
        quantity,
        success_url,
        intent_id,
      } => {
        self
          .create_checkout(
            &mut changes,
            actor_user_id.as_deref(),
            user_email.as_deref(),
            &target_type,
            target_id.as_deref(),
            &plan,
            &recurring,
            variant.as_deref(),
            coupon.as_deref(),
            quantity,
            &success_url,
            &intent_id,
          )
          .await
      }
      PaymentCommand::MutateSubscription {
        actor_user_id,
        target,
        mutation,
        intent_id,
      } => {
        self
          .mutate_subscription(&mut changes, &actor_user_id, &target, &mutation, &intent_id)
          .await
      }
      PaymentCommand::UpdateRecurring {
        actor_user_id,
        validate_key,
        target,
        recurring,
        intent_id,
      } => {
        self
          .update_recurring(
            &mut changes,
            actor_user_id.as_deref(),
            validate_key.as_deref(),
            &target,
            &recurring,
            &intent_id,
          )
          .await
      }
      PaymentCommand::UpdateQuantity {
        actor_user_id,
        validate_key,
        target,
        quantity,
        intent_id,
      } => {
        self
          .update_quantity(
            &mut changes,
            actor_user_id.as_deref(),
            validate_key.as_deref(),
            &target,
            quantity,
            &intent_id,
          )
          .await
      }
      PaymentCommand::RefreshRevenuecat { user_id } => self.refresh_revenuecat(&mut changes, &user_id).await,
      PaymentCommand::RequestApplyRevenuecat {
        user_id,
        transaction_id,
        intent_id,
      } => {
        self
          .request_apply_revenuecat(&mut changes, &user_id, &transaction_id, &intent_id)
          .await
      }
      PaymentCommand::RevealLicense { session_id, intent_id } => {
        self.reveal_license(&mut changes, &session_id, &intent_id).await
      }
      PaymentCommand::ActivateLicense {
        license_key,
        workspace_id,
        operation_id,
      } => self.activate_license(&license_key, &workspace_id, &operation_id).await,
      PaymentCommand::DeactivateLicense {
        license_key,
        validate_key,
      } => self.deactivate_license(&license_key, &validate_key).await,
      PaymentCommand::CheckLicenseHealth {
        license_key,
        validate_key,
        workspace_id,
      } => {
        self
          .check_license_health(&license_key, &validate_key, &workspace_id)
          .await
      }
      PaymentCommand::ActivateLegacyLicense { license_key } => self.activate_legacy_license(&license_key).await,
      PaymentCommand::DeactivateLegacyLicense { license_key } => self.deactivate_legacy_license(&license_key).await,
      PaymentCommand::CheckLegacyLicenseHealth {
        license_key,
        validate_key,
      } => self.check_legacy_license_health(&license_key, &validate_key).await,
      PaymentCommand::PrepareUserDeletion { user_id } => self.prepare_user_deletion(&user_id).await,
    }?;
    Ok(PaymentCommandOutcome { value, changes })
  }
}
