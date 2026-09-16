pub mod backend_runtime;
pub mod storage_runtime;

pub(crate) mod config;
mod config_descriptor;
pub(crate) mod error;
mod http;
pub(crate) mod migrations;
pub(crate) mod object_storage;
mod storage_lifecycle;
use storage_lifecycle::{StorageOperation, lock_workspace_storage_shared_transaction};
pub(crate) mod types;

pub(super) use affine_doc_loader::blob_refs::{BlobRefProjectionError, extract_blob_refs};
#[cfg(test)]
pub(crate) use config::AuthRuntimeConfig;
pub(crate) use config::{
  BackendRuntimeConfig, ConfigSource, CopilotManagedProfileConfig, CopilotManagedProfileConfigFile,
  CopilotRuntimeConfig, CopilotRuntimeConfigFile, Deployment, InviteQuotaConfig, OAuthProviderRuntimeConfig,
  PaymentProductConfig, PaymentRuntimeConfig, RedisRuntimeConfig, RevenueCatRuntimeConfig, SearchRuntimeConfig,
  StripeRuntimeConfig,
};
use config::{SUPPORTED_BYOK_PROVIDERS, validate_copilot_config};
pub use config_descriptor::{AppConfigDescriptor, app_config_descriptors, validate_app_config_value};
pub(crate) use error::{RuntimeError, RuntimeResult, napi_error, to_napi_error};
pub(in crate::runtime) use http::webpki_tls_config;

fn blob_ref_projection_error_code(error: BlobRefProjectionError) -> &'static str {
  match error {
    BlobRefProjectionError::InvalidBinary => "invalid_binary_corrupt",
    BlobRefProjectionError::ClientClockGap => "client_clock_gap",
    BlobRefProjectionError::PendingDependency => "pending_dependency",
    BlobRefProjectionError::Unsupported => "yocto_unsupported",
    BlobRefProjectionError::SourceTooLarge => "blob_ref_source_too_large",
    BlobRefProjectionError::WorkspaceRootTooLarge => "blob_workspace_root_too_large",
    BlobRefProjectionError::WorkspaceRootInvalid => "blob_workspace_root_parse_failed",
    BlobRefProjectionError::WorkspaceRootDocCountTooLarge => "blob_workspace_root_doc_count_too_large",
    BlobRefProjectionError::TreeTooLarge => "blob_ref_tree_too_large",
    BlobRefProjectionError::TreeRootInvalid => "blob_ref_tree_root_invalid",
    BlobRefProjectionError::TreeFanoutTooLarge => "blob_ref_tree_fanout_too_large",
    BlobRefProjectionError::TreeChildInvalid => "blob_ref_tree_child_invalid",
    BlobRefProjectionError::KeyTooLarge => "blob_ref_key_too_large",
    BlobRefProjectionError::RefCountTooLarge => "blob_ref_count_too_large",
  }
}

pub(super) use crate::entitlement::{entitlement_input_error, parse_quantity, parse_target_type};
