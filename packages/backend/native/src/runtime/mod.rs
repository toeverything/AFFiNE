pub mod backend_runtime;
pub(in crate::runtime) use backend_runtime::lock_current_doc_read;
pub mod storage_runtime;

pub(crate) mod config;
pub use config::ServerConfigHandle;
mod document_state;
pub(crate) mod error;
mod http;
pub(crate) mod migrations;
pub(crate) mod object_storage;
mod storage_lifecycle;
pub(in crate::runtime) use document_state::{
  WorkspaceDocState, ensure_doc_not_deleted_in, ensure_workspace_sync_protocol_in, is_ordinary_workspace_doc,
  load_doc_states_in, load_workspace_doc_states_in, load_workspace_doc_states_page_in, workspace_lifecycle_active_in,
};
use storage_lifecycle::{
  StorageOperation, lock_workspace_storage_shared_transaction, try_lock_workspace_storage_shared_transaction,
};
pub(crate) mod types;

pub(super) use affine_doc_loader::blob_refs::{BlobRefProjectionError, extract_blob_refs};
#[cfg(test)]
pub(crate) use config::AuthRuntimeConfig;
pub use config::{AppConfigDescriptor, app_config_descriptors, validate_app_config_value};
pub(crate) use config::{
  BackendRuntimeConfig, CopilotRuntimeConfig, Deployment, InviteQuotaConfig, OAuthProviderRuntimeConfig,
  PaymentProductConfig, PaymentRuntimeConfig, RedisRuntimeConfig, RevenueCatRuntimeConfig, SearchRuntimeConfig,
  StripeRuntimeConfig,
};
pub(crate) use error::{RuntimeError, RuntimeResult, napi_error, to_napi_error};
pub(in crate::runtime) use http::webpki_tls_config;

fn blob_ref_projection_error_code(error: BlobRefProjectionError) -> &'static str {
  match error {
    BlobRefProjectionError::InvalidBinary => "invalid_binary_corrupt",
    BlobRefProjectionError::ClientClockGap => "client_clock_gap",
    BlobRefProjectionError::PendingDependency => "pending_dependency",
    BlobRefProjectionError::Unsupported => "yocto_unsupported",
    BlobRefProjectionError::SourceTooLarge => "blob_ref_source_too_large",
    BlobRefProjectionError::TreeTooLarge => "blob_ref_tree_too_large",
    BlobRefProjectionError::TreeRootInvalid => "blob_ref_tree_root_invalid",
    BlobRefProjectionError::TreeFanoutTooLarge => "blob_ref_tree_fanout_too_large",
    BlobRefProjectionError::TreeChildInvalid => "blob_ref_tree_child_invalid",
    BlobRefProjectionError::KeyTooLarge => "blob_ref_key_too_large",
    BlobRefProjectionError::RefCountTooLarge => "blob_ref_count_too_large",
  }
}

pub(in crate::runtime) use storage_runtime::{CurrentDoc, CurrentDocUpdate};

pub(super) use crate::entitlement::{entitlement_input_error, parse_quantity, parse_target_type};

pub(crate) const BASELINE_VERSION: &str = "0.27.5";

pub(crate) fn pg_connect_options(
  database_url: &str,
  deployment: Deployment,
  role: &str,
) -> RuntimeResult<sqlx::postgres::PgConnectOptions> {
  let deployment_name = match deployment {
    Deployment::Cloud => "cloud",
    Deployment::SelfHosted => "selfhosted",
  };
  let app_name = format!("affine:{deployment_name}:{role}:{BASELINE_VERSION}");
  database_url
    .parse::<sqlx::postgres::PgConnectOptions>()
    .map(|options| options.application_name(&app_name))
    .map_err(|err| RuntimeError::config(format!("invalid postgres database url: {err}")))
}

pub(crate) fn parse_redis_db(redis_url: Option<&str>) -> Option<i32> {
  let url = redis_url.and_then(|raw| url::Url::parse(raw).ok())?;
  let segment = url.path().trim_start_matches('/');
  if segment.is_empty() {
    Some(0)
  } else {
    segment.parse::<i32>().ok()
  }
}
