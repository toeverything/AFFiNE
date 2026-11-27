//! Calendar GraphQL types, nested resolvers, and root mutations aligned with
//! `v0.27.5` `schema.gql`.
use super::admin::CalendarProviderType;
use super::{current_authenticated_user, require_authenticated_user};
use crate::AppState;
use crate::legacy_compat::errors::{LegacyErrorEnvelope, domain_error_to_graphql, envelope_to_graphql};
use async_graphql::{Context, Error, InputObject, Object, Result, SimpleObject};
use chrono::{DateTime, Utc};
use server_domain::calendar::caldav::CalendarCaldavProviderPreset;
use server_domain::calendar::oauth::{CalendarOAuthState, CalendarOAuthStore};
use server_domain::calendar::{
  CalendarAccountRecord, CalendarError, CalendarEventRecord, CalendarProviderName, CalendarService,
  CalendarSubscriptionRecord, LinkCaldavInput, WorkspaceCalendarItemPatch, WorkspaceCalendarItemRecord,
  WorkspaceCalendarRecord, truncate_calendar_error,
};
use server_types::DomainError;
use std::sync::Arc;
pub(crate) fn calendar_service_from_state(state: &AppState) -> &CalendarService {
  &state.calendar
}
pub(crate) fn calendar_oauth_store_from_state(
  state: &AppState,
) -> std::result::Result<&CalendarOAuthStore, DomainError> {
  state
    .calendar_oauth
    .as_ref()
    .ok_or_else(|| DomainError::Unavailable("session redis is not configured".to_owned()))
}
pub(crate) fn calendar_error_to_envelope(err: &CalendarError) -> LegacyErrorEnvelope {
  match err {
    CalendarError::BadRequest { code, message } => LegacyErrorEnvelope {
      status: 400,
      code: "Bad Request".to_owned(),
      error_type: "BAD_REQUEST".to_owned(),
      name: "GRAPHQL_BAD_REQUEST".to_owned(),
      message: message.clone(),
      data: Some(serde_json::json!({ "code": code, "message": message })),
    },
    CalendarError::ProviderRequest { status, message } => {
      let msg = truncate_calendar_error(message);
      LegacyErrorEnvelope {
        status: 500,
        code: "Internal Server Error".to_owned(),
        error_type: "INTERNAL_SERVER_ERROR".to_owned(),
        name: "CALENDAR_PROVIDER_REQUEST_ERROR".to_owned(),
        message: format!("Calendar provider request error, status: {status}, message: {msg}"),
        data: Some(serde_json::json!({ "status": status, "message": msg })),
      }
    }
    CalendarError::SyncTokenInvalid(msg) => LegacyErrorEnvelope {
      status: 400,
      code: "Bad Request".to_owned(),
      error_type: "BAD_REQUEST".to_owned(),
      name: "GRAPHQL_BAD_REQUEST".to_owned(),
      message: msg.clone(),
      data: Some(serde_json::json!({ "code": "calendar_sync_token_invalid", "message": msg })),
    },
    CalendarError::Domain(dom) => crate::legacy_compat::errors::domain_error_to_envelope(dom),
    CalendarError::Internal(msg) => {
      crate::legacy_compat::errors::domain_error_to_envelope(&DomainError::Internal(msg.clone()))
    }
  }
}
pub(crate) fn calendar_error_to_graphql(err: CalendarError) -> Error {
  envelope_to_graphql(calendar_error_to_envelope(&err))
}
impl From<CalendarProviderName> for CalendarProviderType {
  fn from(value: CalendarProviderName) -> Self {
    match value {
      CalendarProviderName::Google => Self::Google,
      CalendarProviderName::CalDAV => Self::CalDAV,
    }
  }
}
impl From<CalendarProviderType> for CalendarProviderName {
  fn from(value: CalendarProviderType) -> Self {
    match value {
      CalendarProviderType::Google => Self::Google,
      CalendarProviderType::CalDAV => Self::CalDAV,
    }
  }
}
#[derive(SimpleObject, Clone, Debug, Eq, PartialEq)]
#[graphql(name = "CalendarCalDAVProviderPresetObjectType")]
pub struct CalendarCalDAVProviderPresetObjectType {
  pub id: String,
  pub label: String,
  pub requires_app_password: Option<bool>,
  pub docs_url: Option<String>,
}
impl From<CalendarCaldavProviderPreset> for CalendarCalDAVProviderPresetObjectType {
  fn from(v: CalendarCaldavProviderPreset) -> Self {
    Self {
      id: v.id,
      label: v.label,
      requires_app_password: v.requires_app_password,
      docs_url: v.docs_url,
    }
  }
}
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "CalendarSubscriptionObjectType")]
pub struct CalendarSubscriptionObjectType {
  pub id: String,
  pub account_id: String,
  pub provider: CalendarProviderType,
  pub external_calendar_id: String,
  pub display_name: Option<String>,
  pub timezone: Option<String>,
  pub color: Option<String>,
  pub enabled: bool,
  pub last_sync_at: Option<DateTime<Utc>>,
}
impl From<CalendarSubscriptionRecord> for CalendarSubscriptionObjectType {
  fn from(value: CalendarSubscriptionRecord) -> Self {
    Self {
      id: value.id,
      account_id: value.account_id,
      provider: value.provider.into(),
      external_calendar_id: value.external_calendar_id,
      display_name: value.display_name,
      timezone: value.timezone,
      color: value.color,
      enabled: value.enabled,
      last_sync_at: value.last_sync_at,
    }
  }
}
#[derive(Clone, Debug)]
pub struct CalendarAccountObjectType {
  record: CalendarAccountRecord,
}
impl From<CalendarAccountRecord> for CalendarAccountObjectType {
  fn from(record: CalendarAccountRecord) -> Self {
    Self { record }
  }
}
#[Object(name = "CalendarAccountObjectType")]
impl CalendarAccountObjectType {
  async fn id(&self) -> &str {
    &self.record.id
  }
  async fn provider(&self) -> CalendarProviderType {
    self.record.provider.into()
  }
  async fn provider_account_id(&self) -> &str {
    &self.record.provider_account_id
  }
  async fn display_name(&self) -> Option<&str> {
    self.record.display_name.as_deref()
  }
  async fn email(&self) -> Option<&str> {
    self.record.email.as_deref()
  }
  async fn status(&self) -> &str {
    &self.record.status
  }
  async fn last_error(&self) -> Option<&str> {
    self.record.last_error.as_deref()
  }
  async fn refresh_interval_minutes(&self) -> i32 {
    self.record.refresh_interval_minutes
  }
  async fn calendars_count(&self) -> i32 {
    self.record.calendars_count
  }
  async fn created_at(&self) -> DateTime<Utc> {
    self.record.created_at
  }
  async fn updated_at(&self) -> DateTime<Utc> {
    self.record.updated_at
  }
  async fn calendars(&self, ctx: &Context<'_>) -> Result<Vec<CalendarSubscriptionObjectType>> {
    let user = require_authenticated_user(ctx).await?;
    let subs = ctx
      .data_unchecked::<Arc<AppState>>()
      .calendar
      .list_account_calendars(&user.id, &self.record.id)
      .await
      .map_err(calendar_error_to_graphql)?;
    Ok(subs.into_iter().map(Into::into).collect())
  }
}
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "WorkspaceCalendarItemObjectType")]
pub struct WorkspaceCalendarItemObjectType {
  pub id: String,
  pub subscription_id: String,
  pub sort_order: Option<i32>,
  pub color_override: Option<String>,
  pub enabled: bool,
}
impl From<WorkspaceCalendarItemRecord> for WorkspaceCalendarItemObjectType {
  fn from(value: WorkspaceCalendarItemRecord) -> Self {
    Self {
      id: value.id,
      subscription_id: value.subscription_id,
      sort_order: value.sort_order,
      color_override: value.color_override,
      enabled: value.enabled,
    }
  }
}
#[derive(SimpleObject, Clone, Debug)]
#[graphql(name = "CalendarEventObjectType")]
pub struct CalendarEventObjectType {
  pub id: String,
  pub subscription_id: String,
  pub external_event_id: String,
  pub recurrence_id: Option<String>,
  pub status: Option<String>,
  pub title: Option<String>,
  pub description: Option<String>,
  pub location: Option<String>,
  pub start_at_utc: DateTime<Utc>,
  pub end_at_utc: DateTime<Utc>,
  pub original_timezone: Option<String>,
  pub all_day: bool,
}
impl From<CalendarEventRecord> for CalendarEventObjectType {
  fn from(value: CalendarEventRecord) -> Self {
    Self {
      id: value.id,
      subscription_id: value.subscription_id,
      external_event_id: value.external_event_id,
      recurrence_id: value.recurrence_id,
      status: value.status,
      title: value.title,
      description: value.description,
      location: value.location,
      start_at_utc: value.start_at_utc,
      end_at_utc: value.end_at_utc,
      original_timezone: value.original_timezone,
      all_day: value.all_day,
    }
  }
}
#[derive(Clone, Debug)]
pub struct WorkspaceCalendarObjectType {
  record: WorkspaceCalendarRecord,
}
impl From<WorkspaceCalendarRecord> for WorkspaceCalendarObjectType {
  fn from(record: WorkspaceCalendarRecord) -> Self {
    Self { record }
  }
}
#[Object(name = "WorkspaceCalendarObjectType")]
impl WorkspaceCalendarObjectType {
  async fn id(&self) -> &str {
    &self.record.id
  }
  async fn workspace_id(&self) -> &str {
    &self.record.workspace_id
  }
  async fn created_by_user_id(&self) -> &str {
    &self.record.created_by_user_id
  }
  async fn display_name_override(&self) -> Option<&str> {
    self.record.display_name_override.as_deref()
  }
  async fn color_override(&self) -> Option<&str> {
    self.record.color_override.as_deref()
  }
  async fn enabled(&self) -> bool {
    self.record.enabled
  }
  async fn items(&self) -> Vec<WorkspaceCalendarItemObjectType> {
    self.record.items.iter().cloned().map(Into::into).collect()
  }
  async fn events(
    &self,
    ctx: &Context<'_>,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
  ) -> Result<Vec<CalendarEventObjectType>> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let perms = state
      .workspaces
      .resolve_workspace_permissions(&user.id, &self.record.workspace_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    if !perms.settings_read {
      return Err(domain_error_to_graphql(&DomainError::Forbidden(
        "Workspace.Settings.Read permission required".to_owned(),
      )));
    }
    let events = state
      .calendar
      .list_workspace_events(&self.record.id, from, to)
      .await
      .map_err(calendar_error_to_graphql)?;
    Ok(events.into_iter().map(Into::into).collect())
  }
}
#[derive(InputObject, Clone, Debug)]
#[graphql(name = "LinkCalendarAccountInput")]
pub struct LinkCalendarAccountInput {
  pub provider: CalendarProviderType,
  pub redirect_uri: Option<String>,
}
#[derive(InputObject, Clone, Debug)]
#[graphql(name = "LinkCalDAVAccountInput")]
pub struct LinkCalDAVAccountInput {
  pub provider_preset_id: String,
  pub username: String,
  pub password: String,
  pub display_name: Option<String>,
}
#[derive(InputObject, Clone, Debug)]
#[graphql(name = "WorkspaceCalendarItemInput")]
pub struct WorkspaceCalendarItemInput {
  pub subscription_id: String,
  pub sort_order: Option<i32>,
  pub color_override: Option<String>,
}
#[derive(InputObject, Clone, Debug)]
#[graphql(name = "UpdateWorkspaceCalendarsInput")]
pub struct UpdateWorkspaceCalendarsInput {
  pub workspace_id: String,
  pub items: Vec<WorkspaceCalendarItemInput>,
}
pub(crate) async fn resolve_server_calendar_providers(ctx: &Context<'_>) -> Result<Vec<CalendarProviderType>> {
  let user_id = current_authenticated_user(ctx).map(|u| u.user_id);
  let providers = ctx
    .data_unchecked::<Arc<AppState>>()
    .calendar
    .list_available_providers(user_id.as_deref())
    .await
    .map_err(calendar_error_to_graphql)?;
  Ok(providers.into_iter().map(Into::into).collect())
}
pub(crate) async fn resolve_server_caldav_providers(
  ctx: &Context<'_>,
) -> Result<Vec<CalendarCalDAVProviderPresetObjectType>> {
  let presets = ctx
    .data_unchecked::<Arc<AppState>>()
    .calendar
    .list_caldav_presets()
    .await
    .map_err(calendar_error_to_graphql)?;
  Ok(presets.into_iter().map(Into::into).collect())
}
pub(crate) async fn resolve_user_calendar_accounts(
  ctx: &Context<'_>,
  target_user_id: &str,
) -> Result<Vec<CalendarAccountObjectType>> {
  let caller = require_authenticated_user(ctx).await?;
  if caller.id != target_user_id {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "Cannot read another user's calendar accounts".to_owned(),
    )));
  }
  let accounts = ctx
    .data_unchecked::<Arc<AppState>>()
    .calendar
    .list_accounts(target_user_id)
    .await
    .map_err(calendar_error_to_graphql)?;
  Ok(accounts.into_iter().map(Into::into).collect())
}
pub(crate) async fn resolve_workspace_calendars(
  ctx: &Context<'_>,
  workspace_id: &str,
) -> Result<Vec<WorkspaceCalendarObjectType>> {
  let user = require_authenticated_user(ctx).await?;
  let state = ctx.data_unchecked::<Arc<AppState>>();
  let perms = state
    .workspaces
    .resolve_workspace_permissions(&user.id, workspace_id)
    .await
    .map_err(|e| domain_error_to_graphql(&e))?;
  if !perms.settings_read {
    return Err(domain_error_to_graphql(&DomainError::Forbidden(
      "Workspace.Settings.Read permission required".to_owned(),
    )));
  }
  let calendars = state
    .calendar
    .get_workspace_calendars(workspace_id)
    .await
    .map_err(calendar_error_to_graphql)?;
  Ok(calendars.into_iter().map(Into::into).collect())
}
#[derive(Default)]
pub struct CalendarMutation;
#[Object]
impl CalendarMutation {
  async fn link_calendar_account(&self, ctx: &Context<'_>, input: LinkCalendarAccountInput) -> Result<String> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let provider: CalendarProviderName = input.provider.into();
    state
      .calendar
      .assert_can_link_provider(&user.id, provider)
      .await
      .map_err(calendar_error_to_graphql)?;
    let req_host = ctx
      .data_opt::<axum::http::HeaderMap>()
      .and_then(|h| h.get(axum::http::header::HOST))
      .and_then(|v| v.to_str().ok());
    let cfg = state.config.load();
    let server_hosts = crate::rest::effective_server_hosts(state).await;
    let redirect_uri = match input.redirect_uri {
      Some(raw) if !raw.is_empty() => Some(
        crate::rest::validate_and_build_calendar_redirect_uri(
          &raw,
          &cfg.external_url,
          &server_hosts,
          cfg.app_config_baseline.server.port,
          req_host,
          &[],
        )
        .map_err(|e| domain_error_to_graphql(&e))?,
      ),
      _ => None,
    };
    let oauth = calendar_oauth_store_from_state(state).map_err(|e| domain_error_to_graphql(&e))?;
    let state_token = oauth
      .save_oauth_state(CalendarOAuthState {
        provider,
        user_id: user.id,
        redirect_uri,
        token: None,
      })
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    let cb_origin = crate::rest::calendar_callback_origin(
      &cfg.external_url,
      &server_hosts,
      cfg.app_config_baseline.server.port,
      req_host,
    );
    let callback_url = state.calendar.callback_url_for(&cb_origin);
    state
      .calendar
      .get_auth_url(provider, &state_token, &callback_url)
      .await
      .map_err(calendar_error_to_graphql)
  }
  #[graphql(name = "linkCalDAVAccount")]
  async fn link_caldav_account(
    &self,
    ctx: &Context<'_>,
    input: LinkCalDAVAccountInput,
  ) -> Result<CalendarAccountObjectType> {
    let user = require_authenticated_user(ctx).await?;
    let account = ctx
      .data_unchecked::<Arc<AppState>>()
      .calendar
      .link_caldav_account(
        &user.id,
        LinkCaldavInput {
          provider_preset_id: input.provider_preset_id,
          username: input.username,
          password: input.password,
          display_name: input.display_name,
        },
      )
      .await
      .map_err(calendar_error_to_graphql)?;
    Ok(account.into())
  }
  async fn update_calendar_account(
    &self,
    ctx: &Context<'_>,
    account_id: String,
    refresh_interval_minutes: i32,
  ) -> Result<Option<CalendarAccountObjectType>> {
    let user = require_authenticated_user(ctx).await?;
    let updated = ctx
      .data_unchecked::<Arc<AppState>>()
      .calendar
      .update_account_refresh_interval(&user.id, &account_id, refresh_interval_minutes)
      .await
      .map_err(calendar_error_to_graphql)?;
    Ok(updated.map(Into::into))
  }
  async fn unlink_calendar_account(&self, ctx: &Context<'_>, account_id: String) -> Result<bool> {
    let user = require_authenticated_user(ctx).await?;
    ctx
      .data_unchecked::<Arc<AppState>>()
      .calendar
      .unlink_account(&user.id, &account_id)
      .await
      .map_err(calendar_error_to_graphql)
  }
  async fn update_workspace_calendars(
    &self,
    ctx: &Context<'_>,
    input: UpdateWorkspaceCalendarsInput,
  ) -> Result<WorkspaceCalendarObjectType> {
    let user = require_authenticated_user(ctx).await?;
    let state = ctx.data_unchecked::<Arc<AppState>>();
    let perms = state
      .workspaces
      .resolve_workspace_permissions(&user.id, &input.workspace_id)
      .await
      .map_err(|e| domain_error_to_graphql(&e))?;
    if !perms.settings_update {
      return Err(domain_error_to_graphql(&DomainError::Forbidden(
        "Workspace.Settings.Update permission required".to_owned(),
      )));
    }
    let patches: Vec<WorkspaceCalendarItemPatch> = input
      .items
      .into_iter()
      .map(|item| WorkspaceCalendarItemPatch {
        subscription_id: item.subscription_id,
        sort_order: item.sort_order,
        color_override: item.color_override,
      })
      .collect();
    let calendar = state
      .calendar
      .update_workspace_calendars(&input.workspace_id, &user.id, &patches)
      .await
      .map_err(calendar_error_to_graphql)?;
    Ok(calendar.into())
  }
}
