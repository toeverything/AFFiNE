//! Zero-CocoaPods iOS native-island narrow state machines (`S6-NativeIslands`):
//! 1. `AffinePaywall`: StoreKit 2 product catalog, purchase state machine, and JWS envelope check.
//! 2. `OnboardingSignIn`: First-launch onboarding + Sign in with Apple / OAuth CSRF narrow bridge.
//! (ShareExtension ingest runs atomically against SQLite in `crate::share_ingest`.)

use serde::{Deserialize, Serialize};

pub use crate::share_ingest::IOS_APP_GROUP_ID;

/// StoreKit 2 paywall narrow bridge state.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PaywallPhase {
    Idle,
    LoadingProducts,
    Ready,
    Purchasing,
    Verified,
    Pending,
    Cancelled,
    Failed,
}

/// StoreKit 2 product descriptor bridged from Swift `Product`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaywallProduct {
    pub product_id: String,
    pub display_name: String,
    pub display_price: String,
}

/// StoreKit 2 paywall state machine + JWS transaction verifier.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaywallStateMachine {
    pub phase: PaywallPhase,
    pub products: Vec<PaywallProduct>,
    pub active_product_id: Option<String>,
    pub verified_transaction_id: Option<String>,
    pub last_error: Option<String>,
}

impl Default for PaywallStateMachine {
    fn default() -> Self {
        Self {
            phase: PaywallPhase::Idle,
            products: Vec::new(),
            active_product_id: None,
            verified_transaction_id: None,
            last_error: None,
        }
    }
}

impl PaywallStateMachine {
    pub fn is_known_product_id(product_id: &str) -> bool {
        matches!(
            product_id,
            "pro.affine.pro.monthly"
                | "pro.affine.pro.yearly"
                | "pro.affine.ai.monthly"
                | "pro.affine.ai.yearly"
        )
    }

    /// Validates a compact 3-part JWS string (`header.payload.signature`) with non-empty segments.
    pub fn is_valid_jws_envelope(jws: &str) -> bool {
        let mut parts = jws.split('.');
        let (Some(h), Some(p), Some(s), None) =
            (parts.next(), parts.next(), parts.next(), parts.next())
        else {
            return false;
        };
        let valid_seg = |seg: &str| {
            !seg.is_empty()
                && seg
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
        };
        valid_seg(h) && valid_seg(p) && valid_seg(s)
    }

    pub fn begin_load_products(&mut self) {
        self.phase = PaywallPhase::LoadingProducts;
        self.last_error = None;
    }

    pub fn set_products(&mut self, products: Vec<PaywallProduct>) -> Result<(), &'static str> {
        let filtered: Vec<PaywallProduct> = products
            .into_iter()
            .filter(|p| Self::is_known_product_id(&p.product_id))
            .collect();
        if filtered.is_empty() {
            self.phase = PaywallPhase::Failed;
            self.last_error = Some("no allowlisted StoreKit products".to_string());
            return Err("no allowlisted StoreKit products");
        }
        self.products = filtered;
        self.phase = PaywallPhase::Ready;
        self.last_error = None;
        Ok(())
    }

    pub fn begin_purchase(&mut self, product_id: &str) -> Result<(), &'static str> {
        if !Self::is_known_product_id(product_id) {
            return Err("unknown StoreKit product id");
        }
        self.active_product_id = Some(product_id.to_string());
        self.phase = PaywallPhase::Purchasing;
        self.last_error = None;
        Ok(())
    }

    pub fn complete_verified_transaction(
        &mut self,
        transaction_id: &str,
        jws_representation: &str,
    ) -> Result<(), &'static str> {
        if transaction_id.trim().is_empty() {
            self.phase = PaywallPhase::Failed;
            self.last_error = Some("empty transaction id".to_string());
            return Err("empty transaction id");
        }
        if !Self::is_valid_jws_envelope(jws_representation) {
            self.phase = PaywallPhase::Failed;
            self.last_error = Some("invalid JWS receipt envelope".to_string());
            return Err("invalid JWS receipt envelope");
        }
        self.verified_transaction_id = Some(transaction_id.to_string());
        self.phase = PaywallPhase::Verified;
        self.last_error = None;
        Ok(())
    }

    pub fn mark_pending(&mut self) {
        self.phase = PaywallPhase::Pending;
    }

    pub fn mark_cancelled(&mut self) {
        self.phase = PaywallPhase::Cancelled;
    }

    pub fn mark_failed(&mut self, reason: &str) {
        self.phase = PaywallPhase::Failed;
        self.last_error = Some(reason.to_string());
    }

    /// Clear all active entitlements (used when StoreKit 2 `currentEntitlements` is empty
    /// or when a verified transaction update reports revocation/expiration).
    pub fn clear_entitlement(&mut self) {
        self.verified_transaction_id = None;
        self.active_product_id = None;
        self.last_error = None;
        self.phase = if self.products.is_empty() {
            PaywallPhase::Idle
        } else {
            PaywallPhase::Ready
        };
    }
}

/// Onboarding + Native Sign-In (`ASAuthorizationController` / OAuth) state machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OnboardingStage {
    Welcome,
    SignInChoice,
    Authenticating,
    Completed,
    Skipped,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingSignInState {
    pub stage: OnboardingStage,
    pub expected_oauth_state: Option<String>,
    pub authenticated_provider: Option<String>,
    pub authenticated_subject: Option<String>,
    pub last_error: Option<String>,
}

impl Default for OnboardingSignInState {
    fn default() -> Self {
        Self {
            stage: OnboardingStage::Welcome,
            expected_oauth_state: None,
            authenticated_provider: None,
            authenticated_subject: None,
            last_error: None,
        }
    }
}

impl OnboardingSignInState {
    pub fn advance_to_sign_in(&mut self) {
        self.stage = OnboardingStage::SignInChoice;
        self.last_error = None;
    }

    pub fn skip_sign_in(&mut self) {
        self.stage = OnboardingStage::Skipped;
        self.expected_oauth_state = None;
        self.last_error = None;
    }

    pub fn begin_oauth(&mut self, csrf_state: &str) -> Result<(), &'static str> {
        if csrf_state.trim().len() < 8 {
            return Err("oauth state token too short");
        }
        self.expected_oauth_state = Some(csrf_state.to_string());
        self.stage = OnboardingStage::Authenticating;
        self.last_error = None;
        Ok(())
    }

    pub fn complete_apple_sign_in(
        &mut self,
        user_identifier: &str,
        identity_token_jws: &str,
    ) -> Result<(), &'static str> {
        if user_identifier.trim().is_empty() {
            self.last_error = Some("empty apple user identifier".to_string());
            return Err("empty apple user identifier");
        }
        if !PaywallStateMachine::is_valid_jws_envelope(identity_token_jws) {
            self.last_error = Some("invalid apple identity token JWS".to_string());
            return Err("invalid apple identity token JWS");
        }
        self.authenticated_provider = Some("apple".to_string());
        self.authenticated_subject = Some(user_identifier.to_string());
        self.expected_oauth_state = None;
        self.stage = OnboardingStage::Completed;
        self.last_error = None;
        Ok(())
    }

    pub fn complete_oauth_callback(&mut self, code: &str, state: &str) -> Result<(), &'static str> {
        let Some(expected) = self.expected_oauth_state.as_deref() else {
            return Err("no pending oauth state");
        };
        if state != expected {
            self.last_error = Some("oauth state mismatch".to_string());
            return Err("oauth state mismatch");
        }
        if code.trim().is_empty() {
            self.last_error = Some("empty oauth authorization code".to_string());
            return Err("empty oauth authorization code");
        }
        self.authenticated_provider = Some("oauth".to_string());
        self.authenticated_subject = Some(code.to_string());
        self.expected_oauth_state = None;
        self.stage = OnboardingStage::Completed;
        self.last_error = None;
        Ok(())
    }
}

/// Combined narrow-bridge state for the iOS native islands.
#[derive(Debug, Default)]
pub struct IosNativeIslandsState {
    pub paywall: PaywallStateMachine,
    pub onboarding: OnboardingSignInState,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ios_native_islands_cover_paywall_revocation_and_onboarding() {
        let mut islands = IosNativeIslandsState::default();

        // 1. AffinePaywall StoreKit 2 state machine + JWS validation + revocation clearing.
        islands.paywall.begin_load_products();
        islands
            .paywall
            .set_products(vec![PaywallProduct {
                product_id: "pro.affine.pro.monthly".into(),
                display_name: "AFFiNE Pro Monthly".into(),
                display_price: "$9.99".into(),
            }])
            .expect("products");
        islands
            .paywall
            .begin_purchase("pro.affine.pro.monthly")
            .expect("begin purchase");
        assert!(
            islands
                .paywall
                .complete_verified_transaction("tx-1", "not-a-jws")
                .is_err()
        );
        islands
            .paywall
            .complete_verified_transaction("tx-1", "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln")
            .expect("verified jws");
        assert_eq!(islands.paywall.phase, PaywallPhase::Verified);
        assert_eq!(
            islands.paywall.verified_transaction_id.as_deref(),
            Some("tx-1")
        );

        islands.paywall.clear_entitlement();
        assert_eq!(islands.paywall.phase, PaywallPhase::Ready);
        assert!(islands.paywall.verified_transaction_id.is_none());

        // 2. Onboarding + Sign in with Apple / OAuth CSRF guard.
        islands.onboarding.advance_to_sign_in();
        islands
            .onboarding
            .begin_oauth("csrf-state-123456")
            .expect("oauth begin");
        assert!(
            islands
                .onboarding
                .complete_oauth_callback("auth-code", "wrong-state")
                .is_err()
        );
        islands
            .onboarding
            .complete_apple_sign_in(
                "001234.abcdef",
                "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2ln",
            )
            .expect("apple sign-in");
        assert_eq!(islands.onboarding.stage, OnboardingStage::Completed);
    }
}
