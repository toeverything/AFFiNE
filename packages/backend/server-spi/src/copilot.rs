//! Copilot policy and runtime SPI for community and commercial editions.

use std::collections::BTreeMap;
use std::pin::Pin;

use chrono::{DateTime, Utc};
use futures_util::Stream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use server_types::{AccessGrant, DeploymentMode, DomainError};

#[async_trait::async_trait]
pub trait CopilotPolicySpi: Send + Sync + 'static {
  async fn check_copilot_allowed(&self, grant: &AccessGrant, using_byok: bool) -> Result<(), DomainError>;
}

/// Default community copilot policy SPI.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityCopilotPolicySpi;

#[async_trait::async_trait]
impl CopilotPolicySpi for CommunityCopilotPolicySpi {
  async fn check_copilot_allowed(&self, grant: &AccessGrant, using_byok: bool) -> Result<(), DomainError> {
    if using_byok && !grant.rights.copilot_byok {
      return Err(DomainError::Forbidden(
        "copilot BYOK requires a license with copilot_byok right".into(),
      ));
    }
    if grant.limits.seat_limit <= 0 {
      return Err(DomainError::QuotaExceeded {
        kind: "copilot",
        message: "workspace grant is read-only".into(),
      });
    }
    Ok(())
  }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CopilotScopeMode {
  Personal,
  Canonical,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CopilotHistoryOrder {
  Asc,
  Desc,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CopilotRouteTargetRecord {
  pub id: String,
  pub display_name: String,
  pub minimum_tier: String,
  pub available: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CopilotRouteOptionsRecord {
  pub route_id: String,
  pub default_target_id: Option<String>,
  pub choices: Vec<CopilotRouteTargetRecord>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CopilotQuotaRecord {
  pub limit: Option<i64>,
  pub used: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CopilotSessionSummaryRecord {
  pub id: String,
  pub doc_id: Option<String>,
  pub parent_session_id: Option<String>,
  pub pinned: bool,
  pub prompt_name: String,
  pub title: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CopilotStreamObjectRecord {
  pub kind: String,
  pub text_delta: Option<String>,
  pub tool_call_id: Option<String>,
  pub tool_name: Option<String>,
  pub args: Option<Value>,
  pub result: Option<Value>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CopilotChatMessageRecord {
  pub id: Option<String>,
  pub role: String,
  pub content: String,
  pub attachments: Option<Vec<String>>,
  pub params: Option<Value>,
  pub scope_snapshot: Option<Value>,
  pub stream_objects: Option<Vec<CopilotStreamObjectRecord>>,
  pub created_at: DateTime<Utc>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct CopilotHistoryRecord {
  pub session_id: String,
  pub workspace_id: String,
  pub doc_id: Option<String>,
  pub parent_session_id: Option<String>,
  pub prompt_name: String,
  pub action: Option<String>,
  pub pinned: bool,
  pub title: Option<String>,
  pub created_at: DateTime<Utc>,
  pub updated_at: DateTime<Utc>,
  pub messages: Vec<CopilotChatMessageRecord>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct PaginatedCopilotHistoriesRecord {
  pub items: Vec<CopilotHistoryRecord>,
  pub total_count: i64,
  pub has_next_page: bool,
  pub has_previous_page: bool,
}

#[derive(Clone, Debug)]
pub struct CreateCopilotSessionSpiInput {
  pub user_id: String,
  pub workspace_id: String,
  pub doc_id: Option<String>,
  pub prompt_name: String,
  pub pinned: bool,
  pub reuse_latest_chat: bool,
}

#[derive(Clone, Debug)]
pub struct UpdateCopilotSessionSpiInput {
  pub user_id: String,
  pub session_id: String,
  /// `None` means unchanged; `Some(None)` clears `doc_id`; `Some(Some(id))` sets `doc_id`.
  pub doc_id: Option<Option<String>>,
  pub pinned: Option<bool>,
  pub prompt_name: Option<String>,
}

#[derive(Clone, Debug)]
pub struct ForkCopilotSessionSpiInput {
  pub user_id: String,
  pub workspace_id: String,
  pub doc_id: String,
  pub session_id: String,
  pub latest_message_id: Option<String>,
}

#[derive(Clone, Debug)]
pub struct CleanupCopilotSessionsSpiInput {
  pub user_id: String,
  pub workspace_id: String,
  pub doc_id: Option<String>,
  pub session_ids: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct ListCopilotSessionsSpiInput {
  pub user_id: String,
  pub workspace_id: String,
  /// `None` means any `doc_id`; `Some(None)` means `doc_id IS NULL`; `Some(Some(id))` means `doc_id = id`.
  pub doc_id: Option<Option<String>>,
  pub action: Option<bool>,
  pub fork: Option<bool>,
  pub pinned: Option<bool>,
  pub limit: Option<i64>,
  pub skip: Option<i64>,
}

#[derive(Clone, Debug, Default)]
pub struct ListCopilotHistoriesSpiInput {
  pub user_id: String,
  pub workspace_id: String,
  /// `None` means any `doc_id`; `Some(None)` means `doc_id IS NULL`; `Some(Some(id))` means `doc_id = id`.
  pub doc_id: Option<Option<String>>,
  pub session_id: Option<String>,
  pub action: Option<bool>,
  pub fork: Option<bool>,
  pub pinned: Option<bool>,
  pub limit: Option<i64>,
  pub skip: Option<i64>,
  pub session_order: Option<CopilotHistoryOrder>,
  pub message_order: Option<CopilotHistoryOrder>,
  pub with_messages: Option<bool>,
  pub with_prompt: Option<bool>,
}

#[derive(Clone, Debug)]
pub struct ListCopilotChatsSpiInput {
  pub query: ListCopilotHistoriesSpiInput,
  pub first: i64,
  pub offset: i64,
  pub after_cursor: Option<String>,
}

#[derive(Clone, Debug)]
pub struct UploadedCopilotFile {
  pub filename: Option<String>,
  pub content_type: Option<String>,
  pub bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct CreateCopilotMessageSpiInput {
  pub user_id: String,
  pub session_id: String,
  pub content: Option<String>,
  pub attachments: Vec<String>,
  pub uploads: Vec<UploadedCopilotFile>,
  pub params: Option<Value>,
}

#[derive(Clone, Debug)]
pub struct UploadCopilotAttachmentSpiInput {
  pub user_id: String,
  pub session_id: String,
  pub workspace_id: String,
  pub key: String,
  pub declared_mime_type: Option<String>,
  pub file_name: Option<String>,
  pub bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct DownloadCopilotAttachmentSpiInput {
  pub user_id: String,
  pub session_id: String,
  pub workspace_id: String,
  pub key: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CopilotAttachmentObject {
  pub content_type: String,
  pub bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
pub struct CopilotStreamSpiInput {
  pub user_id: String,
  pub session_id: String,
  pub query: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CopilotSseFrame {
  Message { id: Option<String>, data: String },
  Attachment { id: Option<String>, data: String },
  Event { id: Option<String>, data: Value },
  Error { id: Option<String>, data: Value },
}

pub type CopilotSseStream = Pin<Box<dyn Stream<Item = Result<CopilotSseFrame, DomainError>> + Send>>;

pub struct PreparedCopilotSseStream {
  pub message_id: String,
  pub stream: CopilotSseStream,
}

fn copilot_disabled() -> DomainError {
  DomainError::Forbidden("Copilot is disabled.".into())
}

/// Runtime availability and execution boundary for Copilot features.
#[async_trait::async_trait]
pub trait CopilotRuntimeSpi: Send + Sync + 'static {
  fn is_enabled(&self) -> bool {
    false
  }

  async fn is_effectively_enabled(&self, app_config_copilot_enabled: bool) -> bool {
    self.is_enabled() && app_config_copilot_enabled
  }

  async fn assert_enabled(&self, app_config_copilot_enabled: bool) -> Result<(), DomainError> {
    if self.is_effectively_enabled(app_config_copilot_enabled).await {
      Ok(())
    } else {
      Err(copilot_disabled())
    }
  }

  async fn route_options(
    &self,
    _user_id: &str,
    _deployment: DeploymentMode,
    _app_config_copilot_enabled: bool,
    _prompt_name: &str,
  ) -> Result<Option<CopilotRouteOptionsRecord>, DomainError> {
    Err(copilot_disabled())
  }

  async fn get_quota(&self, _user_id: &str) -> Result<CopilotQuotaRecord, DomainError> {
    Err(copilot_disabled())
  }

  async fn validate_workspace_collection(
    &self,
    _user_id: &str,
    _workspace_id: &str,
    _doc_id: Option<&str>,
    _action_override: Option<&str>,
  ) -> Result<CopilotScopeMode, DomainError> {
    Err(copilot_disabled())
  }

  async fn create_session(&self, _input: CreateCopilotSessionSpiInput) -> Result<String, DomainError> {
    Err(copilot_disabled())
  }

  async fn create_session_with_history(
    &self,
    _input: CreateCopilotSessionSpiInput,
  ) -> Result<CopilotHistoryRecord, DomainError> {
    Err(copilot_disabled())
  }

  async fn update_session(&self, _input: UpdateCopilotSessionSpiInput) -> Result<String, DomainError> {
    Err(copilot_disabled())
  }

  async fn fork_session(&self, _input: ForkCopilotSessionSpiInput) -> Result<String, DomainError> {
    Err(copilot_disabled())
  }

  async fn cleanup_sessions(&self, _input: CleanupCopilotSessionsSpiInput) -> Result<Vec<String>, DomainError> {
    Err(copilot_disabled())
  }

  async fn get_session(
    &self,
    _user_id: &str,
    _workspace_id: Option<&str>,
    _session_id: &str,
  ) -> Result<CopilotSessionSummaryRecord, DomainError> {
    Err(copilot_disabled())
  }

  async fn list_sessions(
    &self,
    _input: ListCopilotSessionsSpiInput,
  ) -> Result<Vec<CopilotSessionSummaryRecord>, DomainError> {
    Err(copilot_disabled())
  }

  async fn list_histories(
    &self,
    _input: ListCopilotHistoriesSpiInput,
  ) -> Result<Vec<CopilotHistoryRecord>, DomainError> {
    Err(copilot_disabled())
  }

  async fn list_chats_paginated(
    &self,
    _input: ListCopilotChatsSpiInput,
  ) -> Result<PaginatedCopilotHistoriesRecord, DomainError> {
    Err(copilot_disabled())
  }

  async fn create_message(&self, _input: CreateCopilotMessageSpiInput) -> Result<String, DomainError> {
    Err(copilot_disabled())
  }

  async fn upload_session_attachment(&self, _input: UploadCopilotAttachmentSpiInput) -> Result<String, DomainError> {
    Err(copilot_disabled())
  }

  async fn download_session_attachment(
    &self,
    _input: DownloadCopilotAttachmentSpiInput,
  ) -> Result<CopilotAttachmentObject, DomainError> {
    Err(copilot_disabled())
  }

  async fn prepare_chat_stream(&self, _input: CopilotStreamSpiInput) -> Result<PreparedCopilotSseStream, DomainError> {
    Err(copilot_disabled())
  }

  async fn prepare_object_stream(
    &self,
    _input: CopilotStreamSpiInput,
  ) -> Result<PreparedCopilotSseStream, DomainError> {
    Err(copilot_disabled())
  }

  async fn prepare_action_stream(
    &self,
    _input: CopilotStreamSpiInput,
  ) -> Result<PreparedCopilotSseStream, DomainError> {
    Err(copilot_disabled())
  }

  async fn prepare_images_stream(
    &self,
    _input: CopilotStreamSpiInput,
  ) -> Result<PreparedCopilotSseStream, DomainError> {
    Err(copilot_disabled())
  }
}

/// Default community copilot runtime SPI that reports Copilot as disabled.
#[derive(Clone, Copy, Debug, Default)]
pub struct CommunityCopilotRuntime;

#[async_trait::async_trait]
impl CopilotRuntimeSpi for CommunityCopilotRuntime {}
