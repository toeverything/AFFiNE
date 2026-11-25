//! Server configuration, admin app-config, test-email, and admin user GraphQL resolvers.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use async_graphql::{ComplexObject, Context, Enum, InputObject, MaybeUndefined, Object, Result, SimpleObject};
use chrono::{DateTime, Utc};
use server_domain::admin::{
  AdminAllSharedLinksQuery, AdminDashboardQuery, AdminSharedLinksOrderBy, AdminUpdateWorkspaceParams,
  AdminWorkspaceFilter, AdminWorkspaceSortOrder, AdminWorkspaceSummary,
};
use server_domain::app_config::AppConfigUpdate;
use server_domain::safe_fetch::{SafeFetchPolicy, SafeFetchRequest, safe_fetch};
use server_mail::{MailSendResult, MailTemplate, SmtpConfig, SmtpMailer, TestMailProps};
use server_types::{DeploymentMode, DomainError};

use super::calendar::{
  CalendarCalDAVProviderPresetObjectType, resolve_server_caldav_providers, resolve_server_calendar_providers,
};
use super::doc::{PageInfo, PaginationInput};
use super::user::{
  CreateUserInput, ImportUsersInput, ListUserInput, ManageUserInput, UserImportResultType, UserType, WorkspaceUserType,
  mutate_admin_ban_user, mutate_admin_create_user, mutate_admin_enable_user, mutate_admin_import_users,
  mutate_admin_update_user, mutate_admin_update_user_features, resolve_admin_user_by_email, resolve_admin_user_by_id,
  resolve_admin_users, resolve_admin_users_count,
};
use super::workspace::WorkspaceMemberStatus;
use super::{JsonObjectScalar, JsonScalar, require_admin_user};
use crate::AppState;
use crate::legacy_compat::errors::domain_error_to_graphql;
use crate::legacy_compat::quota::SafeInt;

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "ServerDeploymentType")]
pub enum ServerDeploymentType {
  #[graphql(name = "Affine")]
  Affine,
  #[graphql(name = "Selfhosted")]
  Selfhosted,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "ServerFeature")]
pub enum ServerFeature {
  #[graphql(name = "Captcha")]
  Captcha,
  #[graphql(name = "Comment")]
  Comment,
  #[graphql(name = "Copilot")]
  Copilot,
  #[graphql(name = "CopilotEmbedding")]
  CopilotEmbedding,
  #[graphql(name = "Indexer")]
  Indexer,
  #[graphql(name = "LocalWorkspace")]
  LocalWorkspace,
  #[graphql(name = "OAuth")]
  OAuth,
  #[graphql(name = "Payment")]
  Payment,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "FeatureType")]
pub enum FeatureType {
  #[graphql(name = "Admin")]
  Admin,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "CalendarProviderType")]
pub enum CalendarProviderType {
  #[graphql(name = "CalDAV")]
  CalDAV,
  #[graphql(name = "Google")]
  Google,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "OAuthProviderType")]
pub enum OAuthProviderType {
  #[graphql(name = "Apple")]
  Apple,
  #[graphql(name = "GitHub")]
  GitHub,
  #[graphql(name = "Google")]
  Google,
  #[graphql(name = "OIDC")]
  OIDC,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "ReleaseVersionType")]
pub struct ReleaseVersionType {
  pub version: String,
  pub url: String,
  pub published_at: DateTime<Utc>,
  pub changelog: String,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PasswordLimitsType")]
pub struct PasswordLimitsType {
  pub min_length: i32,
  pub max_length: i32,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CredentialsRequirementType")]
pub struct CredentialsRequirementType {
  pub password: PasswordLimitsType,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "ServerConfigType", complex)]
pub struct ServerConfigType {
  pub version: String,
  pub name: String,
  #[graphql(name = "type")]
  pub deployment_type: ServerDeploymentType,
  pub initialized: bool,
  pub base_url: String,
  pub features: Vec<ServerFeature>,
  pub credentials_requirement: CredentialsRequirementType,
  pub available_user_features: Vec<FeatureType>,
  pub oauth_providers: Vec<OAuthProviderType>,
}

const AVAILABLE_UPGRADE_CACHE_TTL: Duration = Duration::from_secs(300);

type UpgradeCacheMap = HashMap<(String, String), (Instant, Option<ReleaseVersionType>)>;

fn upgrade_cache() -> &'static Mutex<UpgradeCacheMap> {
  static CACHE: OnceLock<Mutex<UpgradeCacheMap>> = OnceLock::new();
  CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[ComplexObject]
impl ServerConfigType {
  async fn available_upgrade(&self, ctx: &Context<'_>) -> Option<ReleaseVersionType> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let cfg = state.config.load();
    if cfg.deployment_mode != DeploymentMode::Selfhosted {
      return None;
    }
    let channel = match cfg.channel.trim().to_ascii_lowercase().as_str() {
      "canary" => "canary",
      "beta" => "beta",
      _ => "stable",
    };
    let cache_key = (channel.to_owned(), self.version.clone());
    if let Ok(guard) = upgrade_cache().lock()
      && let Some((ts, cached)) = guard.get(&cache_key)
      && ts.elapsed() < AVAILABLE_UPGRADE_CACHE_TTL
    {
      return cached.clone();
    }
    let url = format!("https://affine.pro/api/worker/releases?channel={channel}");
    let policy = SafeFetchPolicy {
      timeout: Duration::from_secs(5),
      connect_timeout: Duration::from_secs(5),
      max_redirects: 2,
      max_response_bytes: 256 * 1024,
      ..SafeFetchPolicy::default()
    };
    let req = SafeFetchRequest::get(url).with_policy(policy);
    let computed = match safe_fetch(req).await {
      Ok(resp) if resp.status.is_success() => serde_json::from_slice::<Vec<serde_json::Value>>(&resp.body)
        .ok()
        .and_then(|releases| {
          let latest = releases.first()?;
          let latest_name = latest
            .get("name")
            .or_else(|| latest.get("tag_name"))
            .and_then(|v| v.as_str())?
            .trim();
          if latest_name.is_empty() || !crate::rest::version_guard::is_newer_semver(&self.version, latest_name) {
            return None;
          }
          let str_field = |a, b| {
            latest
              .get(a)
              .or_else(|| latest.get(b))
              .and_then(|v| v.as_str())
              .unwrap_or_default()
              .to_owned()
          };
          let published_at = latest
            .get("published_at")
            .or_else(|| latest.get("publishedAt"))
            .and_then(|v| v.as_str())
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(Utc::now);
          Some(ReleaseVersionType {
            version: latest_name.to_owned(),
            url: str_field("url", "html_url"),
            published_at,
            changelog: str_field("body", "changelog"),
          })
        }),
      _ => None,
    };
    if let Ok(mut guard) = upgrade_cache().lock() {
      guard.insert(cache_key, (Instant::now(), computed.clone()));
    }
    computed
  }

  async fn calendar_providers(&self, ctx: &Context<'_>) -> Result<Vec<CalendarProviderType>> {
    resolve_server_calendar_providers(ctx).await
  }

  #[graphql(name = "calendarCalDAVProviders")]
  async fn calendar_caldav_providers(&self, ctx: &Context<'_>) -> Result<Vec<CalendarCalDAVProviderPresetObjectType>> {
    resolve_server_caldav_providers(ctx).await
  }
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateAppConfigInput")]
pub struct UpdateAppConfigInput {
  pub module: String,
  pub key: String,
  pub value: Option<JsonScalar>,
  pub clear: Option<bool>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AppConfigValidateResult")]
pub struct AppConfigValidateResult {
  pub module: String,
  pub key: String,
  pub value: Option<JsonScalar>,
  pub valid: bool,
  pub error: Option<String>,
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "TimeBucket")]
pub enum TimeBucket {
  #[graphql(name = "Day")]
  Day,
  #[graphql(name = "Hour")]
  Hour,
  #[graphql(name = "Minute")]
  Minute,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "TimeWindow")]
pub struct TimeWindow {
  pub from: DateTime<Utc>,
  pub to: DateTime<Utc>,
  pub timezone: String,
  pub bucket: TimeBucket,
  pub requested_size: i32,
  pub effective_size: i32,
}

impl From<server_domain::doc_sharing::AdminTimeWindow> for TimeWindow {
  fn from(w: server_domain::doc_sharing::AdminTimeWindow) -> Self {
    Self {
      from: w.from,
      to: w.to,
      timezone: w.timezone,
      bucket: match w.bucket {
        server_domain::doc_sharing::AdminTimeBucket::Day => TimeBucket::Day,
        server_domain::doc_sharing::AdminTimeBucket::Hour => TimeBucket::Hour,
        server_domain::doc_sharing::AdminTimeBucket::Minute => TimeBucket::Minute,
      },
      requested_size: w.requested_size,
      effective_size: w.effective_size,
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "AdminWorkspaceSort")]
pub enum AdminWorkspaceSort {
  #[graphql(name = "BlobCount")]
  BlobCount,
  #[graphql(name = "BlobSize")]
  BlobSize,
  #[graphql(name = "CreatedAt")]
  CreatedAt,
  #[graphql(name = "MemberCount")]
  MemberCount,
  #[graphql(name = "PublicPageCount")]
  PublicPageCount,
  #[graphql(name = "SnapshotCount")]
  SnapshotCount,
  #[graphql(name = "SnapshotSize")]
  SnapshotSize,
}

impl From<AdminWorkspaceSort> for AdminWorkspaceSortOrder {
  fn from(s: AdminWorkspaceSort) -> Self {
    match s {
      AdminWorkspaceSort::BlobCount => Self::BlobCount,
      AdminWorkspaceSort::BlobSize => Self::BlobSize,
      AdminWorkspaceSort::CreatedAt => Self::CreatedAt,
      AdminWorkspaceSort::MemberCount => Self::MemberCount,
      AdminWorkspaceSort::PublicPageCount => Self::PublicPageCount,
      AdminWorkspaceSort::SnapshotCount => Self::SnapshotCount,
      AdminWorkspaceSort::SnapshotSize => Self::SnapshotSize,
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "AdminSharedLinksOrder")]
pub enum AdminSharedLinksOrder {
  #[graphql(name = "PublishedAtDesc")]
  PublishedAtDesc,
  #[graphql(name = "UpdatedAtDesc")]
  UpdatedAtDesc,
  #[graphql(name = "ViewsDesc")]
  ViewsDesc,
}

impl From<AdminSharedLinksOrder> for AdminSharedLinksOrderBy {
  fn from(o: AdminSharedLinksOrder) -> Self {
    match o {
      AdminSharedLinksOrder::PublishedAtDesc => Self::PublishedAtDesc,
      AdminSharedLinksOrder::UpdatedAtDesc => Self::UpdatedAtDesc,
      AdminSharedLinksOrder::ViewsDesc => Self::ViewsDesc,
    }
  }
}

#[derive(Enum, Clone, Copy, Debug, Eq, PartialEq)]
#[graphql(name = "AdminWorkspaceMemberRole")]
pub enum AdminWorkspaceMemberRole {
  #[graphql(name = "Admin")]
  Admin,
  #[graphql(name = "Collaborator")]
  Collaborator,
  #[graphql(name = "Owner")]
  Owner,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "ListWorkspaceInput")]
pub struct ListWorkspaceInput {
  #[graphql(default = 20)]
  pub first: i32,
  #[graphql(default = 0)]
  pub skip: i32,
  pub keyword: Option<String>,
  pub order_by: Option<AdminWorkspaceSort>,
  pub public: Option<bool>,
  pub enable_ai: Option<bool>,
  pub enable_sharing: Option<bool>,
  pub enable_url_preview: Option<bool>,
  pub enable_doc_embedding: Option<bool>,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "AdminUpdateWorkspaceInput")]
pub struct AdminUpdateWorkspaceInput {
  pub id: String,
  pub name: MaybeUndefined<String>,
  pub avatar_key: MaybeUndefined<String>,
  pub public: MaybeUndefined<bool>,
  pub enable_ai: MaybeUndefined<bool>,
  pub enable_sharing: MaybeUndefined<bool>,
  pub enable_url_preview: MaybeUndefined<bool>,
  pub enable_doc_embedding: MaybeUndefined<bool>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminWorkspaceMember")]
pub struct AdminWorkspaceMember {
  pub id: String,
  pub name: String,
  pub email: String,
  pub avatar_url: Option<String>,
  pub role: AdminWorkspaceMemberRole,
  pub status: WorkspaceMemberStatus,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminWorkspaceSharedLink")]
pub struct AdminWorkspaceSharedLink {
  pub doc_id: String,
  pub title: Option<String>,
  pub published_at: Option<DateTime<Utc>>,
}

pub struct AdminWorkspace {
  summary: AdminWorkspaceSummary,
}

#[Object(name = "AdminWorkspace")]
impl AdminWorkspace {
  async fn id(&self) -> &str {
    &self.summary.id
  }
  async fn public(&self) -> bool {
    self.summary.public
  }
  async fn created_at(&self) -> DateTime<Utc> {
    self.summary.created_at
  }
  async fn name(&self) -> Option<&str> {
    self.summary.name.as_deref()
  }
  async fn avatar_key(&self) -> Option<&str> {
    self.summary.avatar_key.as_deref()
  }
  async fn enable_ai(&self) -> bool {
    self.summary.enable_ai
  }
  async fn enable_sharing(&self) -> bool {
    self.summary.enable_sharing
  }
  async fn enable_url_preview(&self) -> bool {
    self.summary.enable_url_preview
  }
  async fn enable_doc_embedding(&self) -> bool {
    self.summary.enable_doc_embedding
  }
  async fn owner(&self) -> Option<WorkspaceUserType> {
    self.summary.owner.as_ref().map(|o| WorkspaceUserType {
      id: o.id.clone(),
      name: o.name.clone(),
      email: o.email.clone(),
      avatar_url: o.avatar_url.clone(),
    })
  }
  async fn member_count(&self) -> i32 {
    self.summary.member_count
  }
  async fn public_page_count(&self) -> i32 {
    self.summary.public_page_count
  }
  async fn snapshot_count(&self) -> i32 {
    self.summary.snapshot_count
  }
  async fn snapshot_size(&self) -> SafeInt {
    SafeInt(self.summary.snapshot_size)
  }
  async fn blob_count(&self) -> i32 {
    self.summary.blob_count
  }
  async fn blob_size(&self) -> SafeInt {
    SafeInt(self.summary.blob_size)
  }

  async fn members(
    &self,
    ctx: &Context<'_>,
    query: Option<String>,
    skip: Option<i32>,
    take: Option<i32>,
  ) -> Result<Vec<AdminWorkspaceMember>> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let rows = state
      .admin
      .list_workspace_members(
        &self.summary.id,
        skip.unwrap_or(0),
        take.unwrap_or(20),
        query.as_deref(),
      )
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(
      rows
        .into_iter()
        .map(|r| AdminWorkspaceMember {
          id: r.id,
          name: r.name,
          email: r.email,
          avatar_url: r.avatar_url,
          role: match r.role.as_str() {
            "Owner" => AdminWorkspaceMemberRole::Owner,
            "Admin" => AdminWorkspaceMemberRole::Admin,
            _ => AdminWorkspaceMemberRole::Collaborator,
          },
          status: match r.status.as_str() {
            "Accepted" => WorkspaceMemberStatus::Accepted,
            "UnderReview" => WorkspaceMemberStatus::UnderReview,
            "NeedMoreSeat" => WorkspaceMemberStatus::NeedMoreSeat,
            "NeedMoreSeatAndReview" => WorkspaceMemberStatus::NeedMoreSeatAndReview,
            "AllocatingSeat" => WorkspaceMemberStatus::AllocatingSeat,
            _ => WorkspaceMemberStatus::Pending,
          },
        })
        .collect(),
    )
  }

  async fn shared_links(&self, ctx: &Context<'_>) -> Result<Vec<AdminWorkspaceSharedLink>> {
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let rows = state
      .admin
      .list_workspace_shared_links(&self.summary.id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(
      rows
        .into_iter()
        .map(|r| AdminWorkspaceSharedLink {
          doc_id: r.doc_id,
          title: r.title,
          published_at: r.published_at,
        })
        .collect(),
    )
  }
}

#[derive(InputObject, Clone, Debug, Default)]
#[graphql(name = "AdminDashboardInput")]
pub struct AdminDashboardInput {
  #[graphql(default_with = "Some(\"UTC\".to_owned())")]
  pub timezone: Option<String>,
  #[graphql(default_with = "Some(30)")]
  pub storage_history_days: Option<i32>,
  #[graphql(default_with = "Some(48)")]
  pub sync_history_hours: Option<i32>,
  #[graphql(default_with = "Some(28)")]
  pub shared_link_window_days: Option<i32>,
  #[graphql(default_with = "Some(7)")]
  pub copilot_window_days: Option<i32>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminDashboardMinutePoint")]
pub struct AdminDashboardMinutePoint {
  pub minute: DateTime<Utc>,
  pub active_users: i32,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminDashboardValueDayPoint")]
pub struct AdminDashboardValueDayPoint {
  pub date: DateTime<Utc>,
  pub value: SafeInt,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminSharedLinkTopItem")]
pub struct AdminSharedLinkTopItem {
  pub workspace_id: String,
  pub doc_id: String,
  pub title: Option<String>,
  pub share_url: String,
  pub published_at: Option<DateTime<Utc>>,
  pub views: SafeInt,
  pub unique_views: SafeInt,
  pub guest_views: SafeInt,
  pub last_accessed_at: Option<DateTime<Utc>>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminDashboard")]
pub struct AdminDashboard {
  pub sync_active_users: i32,
  pub sync_active_users_timeline: Vec<AdminDashboardMinutePoint>,
  pub sync_window: TimeWindow,
  pub copilot_conversations: SafeInt,
  pub copilot_window: TimeWindow,
  pub workspace_storage_bytes: SafeInt,
  pub blob_storage_bytes: SafeInt,
  pub workspace_storage_history: Vec<AdminDashboardValueDayPoint>,
  pub blob_storage_history: Vec<AdminDashboardValueDayPoint>,
  pub storage_window: TimeWindow,
  pub top_shared_links: Vec<AdminSharedLinkTopItem>,
  pub top_shared_links_window: TimeWindow,
  pub generated_at: DateTime<Utc>,
}

#[derive(InputObject, Clone, Debug, Default)]
#[graphql(name = "AdminAllSharedLinksFilterInput")]
pub struct AdminAllSharedLinksFilterInput {
  pub keyword: Option<String>,
  pub workspace_id: Option<String>,
  pub updated_after: Option<DateTime<Utc>>,
  #[graphql(default_with = "Some(AdminSharedLinksOrder::UpdatedAtDesc)")]
  pub order_by: Option<AdminSharedLinksOrder>,
  #[graphql(default_with = "Some(28)")]
  pub analytics_window_days: Option<i32>,
  #[graphql(default_with = "Some(false)")]
  pub include_total: Option<bool>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminAllSharedLink")]
pub struct AdminAllSharedLink {
  pub workspace_id: String,
  pub doc_id: String,
  pub title: Option<String>,
  pub published_at: Option<DateTime<Utc>>,
  pub doc_updated_at: Option<DateTime<Utc>>,
  pub workspace_owner_id: Option<String>,
  pub last_updater_id: Option<String>,
  pub share_url: String,
  pub views: Option<SafeInt>,
  pub unique_views: Option<SafeInt>,
  pub guest_views: Option<SafeInt>,
  pub last_accessed_at: Option<DateTime<Utc>>,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminAllSharedLinkEdge")]
pub struct AdminAllSharedLinkEdge {
  pub cursor: String,
  pub node: AdminAllSharedLink,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "PaginatedAdminAllSharedLink")]
pub struct PaginatedAdminAllSharedLink {
  pub edges: Vec<AdminAllSharedLinkEdge>,
  pub page_info: PageInfo,
  pub total_count: Option<i32>,
  pub analytics_window: TimeWindow,
}

#[derive(InputObject, Clone, Debug)]
#[graphql(name = "AdminMailDeliveriesInput")]
pub struct AdminMailDeliveriesInput {
  #[graphql(default = 24)]
  pub hours: i32,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminMailDeliveryPoint")]
pub struct AdminMailDeliveryPoint {
  pub bucket: DateTime<Utc>,
  pub count: i32,
}

#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "AdminMailDeliverySeries")]
pub struct AdminMailDeliverySeries {
  pub key: String,
  pub label: String,
  pub total: i32,
  pub points: Vec<AdminMailDeliveryPoint>,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "AdminMailDeliverySummary")]
pub struct AdminMailDeliverySummary {
  pub total: i32,
  pub sent: i32,
  pub failed: i32,
  pub skipped: i32,
  pub canceled: i32,
  pub queued: i32,
  pub sending: i32,
  pub retry_wait: i32,
  pub success_rate: f64,
}

#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "AdminMailDeliveryAnalytics")]
pub struct AdminMailDeliveryAnalytics {
  pub window: TimeWindow,
  pub summary: AdminMailDeliverySummary,
  pub by_status: Vec<AdminMailDeliverySeries>,
  pub by_type: Vec<AdminMailDeliverySeries>,
  pub by_outcome: Vec<AdminMailDeliverySeries>,
}

fn not_found_graphql() -> async_graphql::Error {
  crate::legacy_compat::errors::envelope_to_graphql(crate::legacy_compat::errors::LegacyErrorEnvelope {
    status: 404,
    code: "Not Found".into(),
    error_type: "RESOURCE_NOT_FOUND".into(),
    name: "NOT_FOUND".into(),
    message: "Resource not found.".into(),
    data: None,
  })
}

fn require_cloud_admin_console(state: &AppState) -> Result<()> {
  if state.config.load().deployment_mode == DeploymentMode::Selfhosted {
    return Err(not_found_graphql());
  }
  Ok(())
}

fn maybe_undefined_to_patch(v: MaybeUndefined<String>) -> Option<Option<String>> {
  match v {
    MaybeUndefined::Undefined => None,
    MaybeUndefined::Null => Some(None),
    MaybeUndefined::Value(s) => Some(Some(s)),
  }
}

fn to_domain_ws_filter(f: &ListWorkspaceInput) -> AdminWorkspaceFilter {
  AdminWorkspaceFilter {
    skip: f.skip,
    first: f.first,
    keyword: f.keyword.clone(),
    order_by: f.order_by.map(Into::into).unwrap_or_default(),
    public: f.public,
    enable_ai: f.enable_ai,
    enable_sharing: f.enable_sharing,
    enable_url_preview: f.enable_url_preview,
    enable_doc_embedding: f.enable_doc_embedding,
  }
}

pub(crate) async fn resolve_server_config(ctx: &Context<'_>) -> Result<ServerConfigType> {
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let cfg = state.config.load();
  let initialized = state
    .auth
    .is_server_initialized()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let auth_caps = state
    .app_config
    .get_configured_auth_capabilities()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;

  let deployment_type = match cfg.deployment_mode {
    DeploymentMode::Selfhosted => ServerDeploymentType::Selfhosted,
    DeploymentMode::Cloud => ServerDeploymentType::Affine,
  };

  let mut features = vec![
    ServerFeature::Comment,
    ServerFeature::LocalWorkspace,
    ServerFeature::CopilotEmbedding,
  ];
  if state.extension.billing_spi().payment_enabled() {
    features.push(ServerFeature::Payment);
  }
  if state.search.enabled() {
    features.push(ServerFeature::Indexer);
  }

  let mut oauth_providers = Vec::new();
  for (enabled, p) in [
    (auth_caps.oauth_google, OAuthProviderType::Google),
    (auth_caps.oauth_github, OAuthProviderType::GitHub),
    (auth_caps.oauth_apple, OAuthProviderType::Apple),
    (auth_caps.oauth_oidc, OAuthProviderType::OIDC),
  ] {
    if enabled {
      oauth_providers.push(p);
    }
  }
  if !oauth_providers.is_empty() {
    features.push(ServerFeature::OAuth);
  }
  if auth_caps.captcha_enabled {
    features.push(ServerFeature::Captcha);
  }
  let effective_cfg = state
    .app_config
    .get_effective_app_config()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  let (default_min, default_max) = (
    i32::try_from(state.auth.config().password_min_length).unwrap_or(8),
    i32::try_from(state.auth.config().password_max_length).unwrap_or(32),
  );
  let read_pw_limit = |ptr: &str, fallback: i32| {
    effective_cfg
      .pointer(ptr)
      .and_then(|v| v.as_i64())
      .and_then(|n| i32::try_from(n).ok())
      .unwrap_or(fallback)
  };
  let (password_min, password_max) = (
    read_pw_limit("/auth/passwordRequirements/min", default_min),
    read_pw_limit("/auth/passwordRequirements/max", default_max),
  );
  Ok(ServerConfigType {
    version: cfg.server_version.clone(),
    name: cfg.server_name.clone(),
    deployment_type,
    initialized,
    base_url: cfg.external_url.clone(),
    features,
    credentials_requirement: CredentialsRequirementType {
      password: PasswordLimitsType {
        min_length: password_min,
        max_length: password_max,
      },
    },
    available_user_features: vec![FeatureType::Admin],
    oauth_providers,
  })
}

pub(crate) async fn resolve_app_config(ctx: &Context<'_>) -> Result<JsonObjectScalar> {
  let _admin = require_admin_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let cfg = state
    .app_config
    .get_effective_app_config()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(JsonObjectScalar(cfg))
}

pub(crate) async fn resolve_app_config_metadata(ctx: &Context<'_>) -> Result<JsonObjectScalar> {
  let _admin = require_admin_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let meta = state
    .app_config
    .get_app_config_metadata()
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  Ok(JsonObjectScalar(meta))
}

pub(crate) async fn resolve_validate_app_config(
  ctx: &Context<'_>,
  updates: Vec<UpdateAppConfigInput>,
) -> Result<Vec<AppConfigValidateResult>> {
  let _admin = require_admin_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let items: Vec<(String, String, Option<serde_json::Value>, bool)> = updates
    .into_iter()
    .map(|u| (u.module, u.key, u.value.map(|v| v.0), u.clear.unwrap_or(false)))
    .collect();
  Ok(
    state
      .app_config
      .validate_app_config(&items)
      .into_iter()
      .map(|r| AppConfigValidateResult {
        module: r.module,
        key: r.key,
        value: r.value.map(JsonScalar),
        valid: r.valid,
        error: r.error,
      })
      .collect(),
  )
}

pub(crate) async fn mutate_update_app_config(
  ctx: &Context<'_>,
  updates: Vec<UpdateAppConfigInput>,
) -> Result<JsonObjectScalar> {
  let admin = require_admin_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let domain_updates: Vec<AppConfigUpdate> = updates
    .into_iter()
    .map(|u| {
      let full_key = format!("{}.{}", u.module.trim(), u.key.trim());
      let value = if u.clear.unwrap_or(false) {
        None
      } else {
        u.value.map(|j| j.0)
      };
      AppConfigUpdate { key: full_key, value }
    })
    .collect();
  let touched_blob_storage = domain_updates
    .iter()
    .any(|u| u.key == "storages" || u.key.starts_with("storages.blob"));
  let touched_avatar_storage = domain_updates
    .iter()
    .any(|u| u.key == "storages" || u.key.starts_with("storages.avatar"));
  for u in &domain_updates {
    let raw_blob = match u.key.as_str() {
      "storages.blob.storage" => u.value.as_ref(),
      "storages.blob" => u.value.as_ref().and_then(|v| v.get("storage")),
      "storages" => u.value.as_ref().and_then(|v| v.pointer("/blob/storage")),
      _ => None,
    };
    if let Some(raw) = raw_blob
      && let Some(spec) =
        server_blob::StorageBackendSpec::from_app_config_json(raw, "blobs").map_err(|e| domain_error_to_graphql(&e))?
    {
      let _ = spec.build().map_err(|e| domain_error_to_graphql(&e))?;
    }
    let raw_avatar = match u.key.as_str() {
      "storages.avatar.storage" => u.value.as_ref(),
      "storages.avatar" => u.value.as_ref().and_then(|v| v.get("storage")),
      "storages" => u.value.as_ref().and_then(|v| v.pointer("/avatar/storage")),
      _ => None,
    };
    if let Some(raw) = raw_avatar
      && let Some(spec) = server_blob::StorageBackendSpec::from_app_config_json_scoped(raw, "avatar", "avatars")
        .map_err(|e| domain_error_to_graphql(&e))?
    {
      let _ = spec.build().map_err(|e| domain_error_to_graphql(&e))?;
    }
  }
  let effective = state
    .app_config
    .update_app_config_with_blob_guard(Some(&admin.id), &domain_updates, touched_blob_storage)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if touched_blob_storage {
    state
      .reload_blob_storage_from_app_config()
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
  }
  if touched_avatar_storage {
    state
      .reload_avatar_storage_from_app_config()
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
  }
  if domain_updates
    .iter()
    .any(|u| u.key == "metrics" || u.key.starts_with("metrics."))
  {
    state
      .reconcile_metrics_listener()
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
  }
  Ok(JsonObjectScalar(effective))
}

pub(crate) async fn mutate_send_test_email(ctx: &Context<'_>, config: JsonObjectScalar) -> Result<bool> {
  let admin = require_admin_user(ctx).await?;
  let smtp_cfg: SmtpConfig = serde_json::from_value(config.0)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid SMTP config: {e}"))))?;
  let mailer = SmtpMailer::new(&smtp_cfg)
    .map_err(|e| domain_error_to_graphql(&DomainError::Validation(format!("invalid SMTP config: {e}"))))?;
  let rendered = MailTemplate::TestMail(TestMailProps {}).render();
  match mailer.send(&admin.email, &rendered).await {
    MailSendResult::Accepted { .. } => Ok(true),
    MailSendResult::Rejected {
      provider_response,
      error_code,
    } => Err(domain_error_to_graphql(&DomainError::Validation(format!(
      "test email rejected ({error_code}): {}",
      provider_response.unwrap_or_default()
    )))),
    MailSendResult::Failed { error_code, error, .. } => Err(domain_error_to_graphql(&DomainError::Unavailable(
      format!("test email failed ({error_code}): {error}"),
    ))),
  }
}

#[derive(Default)]
pub struct AdminQuery;

#[async_graphql::Object]
impl AdminQuery {
  async fn server_config(&self, ctx: &Context<'_>) -> Result<ServerConfigType> {
    resolve_server_config(ctx).await
  }

  async fn app_config(&self, ctx: &Context<'_>) -> Result<JsonObjectScalar> {
    resolve_app_config(ctx).await
  }
  async fn app_config_metadata(&self, ctx: &Context<'_>) -> Result<JsonObjectScalar> {
    resolve_app_config_metadata(ctx).await
  }
  async fn validate_app_config(
    &self,
    ctx: &Context<'_>,
    updates: Vec<UpdateAppConfigInput>,
  ) -> Result<Vec<AppConfigValidateResult>> {
    resolve_validate_app_config(ctx, updates).await
  }
  async fn users(&self, ctx: &Context<'_>, filter: ListUserInput) -> Result<Vec<UserType>> {
    resolve_admin_users(ctx, filter).await
  }
  async fn users_count(&self, ctx: &Context<'_>, filter: Option<ListUserInput>) -> Result<i32> {
    resolve_admin_users_count(ctx, filter).await
  }
  async fn user_by_id(&self, ctx: &Context<'_>, id: String) -> Result<UserType> {
    resolve_admin_user_by_id(ctx, id).await
  }
  async fn user_by_email(&self, ctx: &Context<'_>, email: String) -> Result<Option<UserType>> {
    resolve_admin_user_by_email(ctx, email).await
  }

  async fn admin_workspaces(&self, ctx: &Context<'_>, filter: ListWorkspaceInput) -> Result<Vec<AdminWorkspace>> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    require_cloud_admin_console(state)?;
    let rows = state
      .admin
      .list_workspaces(&to_domain_ws_filter(&filter))
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(rows.into_iter().map(|summary| AdminWorkspace { summary }).collect())
  }

  async fn admin_workspaces_count(&self, ctx: &Context<'_>, filter: ListWorkspaceInput) -> Result<i32> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    require_cloud_admin_console(state)?;
    let total = state
      .admin
      .count_workspaces(&to_domain_ws_filter(&filter))
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(i32::try_from(total).unwrap_or(i32::MAX))
  }

  async fn admin_workspace(&self, ctx: &Context<'_>, id: String) -> Result<Option<AdminWorkspace>> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    require_cloud_admin_console(state)?;
    let row = state
      .admin
      .get_workspace(&id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    Ok(row.map(|summary| AdminWorkspace { summary }))
  }

  async fn admin_dashboard(&self, ctx: &Context<'_>, input: Option<AdminDashboardInput>) -> Result<AdminDashboard> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    require_cloud_admin_console(state)?;
    let inp = input.unwrap_or_default();
    let include_top = ctx.look_ahead().field("topSharedLinks").exists();
    let data = state
      .admin
      .get_dashboard(&AdminDashboardQuery {
        timezone: inp.timezone,
        storage_history_days: inp.storage_history_days,
        sync_history_hours: inp.sync_history_hours,
        shared_link_window_days: inp.shared_link_window_days,
        copilot_window_days: inp.copilot_window_days,
        include_top_shared_links: include_top,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let base = state.config.load().external_url.trim_end_matches('/').to_owned();
    Ok(AdminDashboard {
      sync_active_users: data.sync_active_users,
      sync_active_users_timeline: data
        .sync_active_users_timeline
        .into_iter()
        .map(|p| AdminDashboardMinutePoint {
          minute: p.minute,
          active_users: p.active_users,
        })
        .collect(),
      sync_window: data.sync_window.into(),
      copilot_conversations: SafeInt(data.copilot_conversations),
      copilot_window: data.copilot_window.into(),
      workspace_storage_bytes: SafeInt(data.workspace_storage_bytes),
      blob_storage_bytes: SafeInt(data.blob_storage_bytes),
      workspace_storage_history: data
        .workspace_storage_history
        .into_iter()
        .map(|p| AdminDashboardValueDayPoint {
          date: p.date,
          value: SafeInt(p.value),
        })
        .collect(),
      blob_storage_history: data
        .blob_storage_history
        .into_iter()
        .map(|p| AdminDashboardValueDayPoint {
          date: p.date,
          value: SafeInt(p.value),
        })
        .collect(),
      storage_window: data.storage_window.into(),
      top_shared_links: data
        .top_shared_links
        .into_iter()
        .map(|l| AdminSharedLinkTopItem {
          share_url: format!("{base}/workspace/{}/{}", l.workspace_id, l.doc_id),
          workspace_id: l.workspace_id,
          doc_id: l.doc_id,
          title: l.title,
          published_at: l.published_at,
          views: SafeInt(l.views),
          unique_views: SafeInt(l.unique_views),
          guest_views: SafeInt(l.guest_views),
          last_accessed_at: l.last_accessed_at,
        })
        .collect(),
      top_shared_links_window: data.top_shared_links_window.into(),
      generated_at: data.generated_at,
    })
  }

  async fn admin_all_shared_links(
    &self,
    ctx: &Context<'_>,
    filter: Option<AdminAllSharedLinksFilterInput>,
    pagination: PaginationInput,
  ) -> Result<PaginatedAdminAllSharedLink> {
    let _admin = require_admin_user(ctx).await?;
    let after = pagination.validate_and_resolve_after()?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    require_cloud_admin_console(state)?;
    let f = filter.unwrap_or_default();
    let page = state
      .admin
      .paginate_all_shared_links(&AdminAllSharedLinksQuery {
        keyword: f.keyword,
        workspace_id: f.workspace_id,
        updated_after: f.updated_after,
        order_by: f.order_by.map(Into::into).unwrap_or_default(),
        analytics_window_days: f.analytics_window_days,
        include_total: f.include_total.unwrap_or(false),
        first: pagination.resolved_first(10),
        offset: pagination.resolved_offset(),
        after,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let base = state.config.load().external_url.trim_end_matches('/').to_owned();
    let edges = page
      .edges
      .into_iter()
      .map(|e| AdminAllSharedLinkEdge {
        cursor: e.cursor,
        node: AdminAllSharedLink {
          share_url: format!("{base}/workspace/{}/{}", e.node.workspace_id, e.node.doc_id),
          workspace_id: e.node.workspace_id,
          doc_id: e.node.doc_id,
          title: e.node.title,
          published_at: e.node.published_at,
          doc_updated_at: e.node.doc_updated_at,
          workspace_owner_id: e.node.workspace_owner_id,
          last_updater_id: e.node.last_updater_id,
          views: Some(SafeInt(e.node.views)),
          unique_views: Some(SafeInt(e.node.unique_views)),
          guest_views: Some(SafeInt(e.node.guest_views)),
          last_accessed_at: e.node.last_accessed_at,
        },
      })
      .collect();
    Ok(PaginatedAdminAllSharedLink {
      edges,
      page_info: PageInfo {
        start_cursor: page.start_cursor,
        end_cursor: page.end_cursor,
        has_next_page: page.has_next_page,
        has_previous_page: page.has_previous_page,
      },
      total_count: page.total_count,
      analytics_window: page.analytics_window.into(),
    })
  }

  async fn admin_mail_deliveries(
    &self,
    ctx: &Context<'_>,
    input: Option<AdminMailDeliveriesInput>,
  ) -> Result<AdminMailDeliveryAnalytics> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let report = state
      .admin
      .aggregate_mail_deliveries(input.map(|i| i.hours))
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let map_series = |list: Vec<server_domain::admin::AdminMailDeliverySeries>| -> Vec<AdminMailDeliverySeries> {
      list
        .into_iter()
        .map(|s| AdminMailDeliverySeries {
          key: s.key,
          label: s.label,
          total: s.total,
          points: s
            .points
            .into_iter()
            .map(|p| AdminMailDeliveryPoint {
              bucket: p.bucket,
              count: p.count,
            })
            .collect(),
        })
        .collect()
    };
    Ok(AdminMailDeliveryAnalytics {
      window: report.window.into(),
      summary: AdminMailDeliverySummary {
        total: report.summary.total,
        sent: report.summary.sent,
        failed: report.summary.failed,
        skipped: report.summary.skipped,
        canceled: report.summary.canceled,
        queued: report.summary.queued,
        sending: report.summary.sending,
        retry_wait: report.summary.retry_wait,
        success_rate: report.summary.success_rate,
      },
      by_status: map_series(report.by_status),
      by_type: map_series(report.by_type),
      by_outcome: map_series(report.by_outcome),
    })
  }
}

#[derive(Default)]
pub struct AdminMutation;

#[async_graphql::Object]
impl AdminMutation {
  async fn update_app_config(&self, ctx: &Context<'_>, updates: Vec<UpdateAppConfigInput>) -> Result<JsonObjectScalar> {
    mutate_update_app_config(ctx, updates).await
  }

  async fn send_test_email(&self, ctx: &Context<'_>, config: JsonObjectScalar) -> Result<bool> {
    mutate_send_test_email(ctx, config).await
  }
  async fn create_user(&self, ctx: &Context<'_>, input: CreateUserInput) -> Result<UserType> {
    mutate_admin_create_user(ctx, input).await
  }
  async fn update_user(&self, ctx: &Context<'_>, id: String, input: ManageUserInput) -> Result<UserType> {
    mutate_admin_update_user(ctx, id, input).await
  }
  async fn ban_user(&self, ctx: &Context<'_>, id: String) -> Result<UserType> {
    mutate_admin_ban_user(ctx, id).await
  }
  async fn enable_user(&self, ctx: &Context<'_>, id: String) -> Result<UserType> {
    mutate_admin_enable_user(ctx, id).await
  }
  async fn update_user_features(
    &self,
    ctx: &Context<'_>,
    features: Vec<FeatureType>,
    id: String,
  ) -> Result<Vec<FeatureType>> {
    mutate_admin_update_user_features(ctx, id, features).await
  }
  async fn import_users(&self, ctx: &Context<'_>, input: ImportUsersInput) -> Result<Vec<UserImportResultType>> {
    mutate_admin_import_users(ctx, input).await
  }

  async fn admin_update_workspace(
    &self,
    ctx: &Context<'_>,
    input: AdminUpdateWorkspaceInput,
  ) -> Result<Option<AdminWorkspace>> {
    let _admin = require_admin_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    require_cloud_admin_console(state)?;
    let reject_null_bool = |field: &str, v: MaybeUndefined<bool>| -> Result<Option<bool>> {
      match v {
        MaybeUndefined::Undefined => Ok(None),
        MaybeUndefined::Value(b) => Ok(Some(b)),
        MaybeUndefined::Null => Err(domain_error_to_graphql(&DomainError::Internal(format!(
          "Field {field} cannot be null."
        )))),
      }
    };
    let ws_id = input.id.clone();
    let public_patch = match input.public {
      MaybeUndefined::Undefined => None,
      MaybeUndefined::Null => Some(false),
      MaybeUndefined::Value(b) => Some(b),
    };
    let enable_ai = reject_null_bool("enableAi", input.enable_ai)?;
    let enable_sharing = reject_null_bool("enableSharing", input.enable_sharing)?;
    let enable_url_preview = reject_null_bool("enableUrlPreview", input.enable_url_preview)?;
    let enable_doc_embedding = reject_null_bool("enableDocEmbedding", input.enable_doc_embedding)?;
    let access_changed = public_patch.is_some() || enable_sharing.is_some();
    let params = AdminUpdateWorkspaceParams {
      id: input.id,
      name: maybe_undefined_to_patch(input.name),
      avatar_key: maybe_undefined_to_patch(input.avatar_key),
      public: public_patch,
      enable_ai,
      enable_sharing,
      enable_url_preview,
      enable_doc_embedding,
    };
    let has_changes = params.has_changes();
    let row = state.admin.update_workspace(&params).await.map_err(|e| match &e {
      DomainError::NotFound(msg) if msg == "not_found" => not_found_graphql(),
      _ => domain_error_to_graphql(&e),
    })?;
    if has_changes && row.is_some() {
      super::workspace::publish_workspace_updated_events(state, &ws_id, access_changed).await;
    }
    Ok(row.map(|summary| AdminWorkspace { summary }))
  }
}
