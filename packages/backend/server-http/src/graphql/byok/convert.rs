//! Bidirectional conversions between BYOK GraphQL types and neutral `server-spi` DTOs.

use async_graphql::ID;
use chrono::{TimeZone, Utc};
use server_spi::{
  ByokCapabilityDto, ByokCatalogDto, ByokEndpointDto, ByokLocalLeaseDto, ByokModelDeclarationDto, ByokModelProbeDto,
  ByokPolicyDto, ByokProbeResultDto, ByokProbeStatusDto, ByokProfileDefinitionDto, ByokProfileDto, ByokSettingsDto,
  ByokUsagePointDto, ByokValidationDto,
};
use server_types::DomainError;

use super::types::{
  ByokAttachmentKind, ByokAttachmentSource, ByokCustomEndpointMode, ByokEndpointKind, ByokModelFeature, ByokModelInput,
  ByokModelOutput, ByokOpenAiDialect, ByokProbeOperation, ByokProbeStatusKind, ByokProvider,
  CreateWorkspaceByokLocalLeaseResultType, WorkspaceByokCapabilityType, WorkspaceByokCatalogModelType,
  WorkspaceByokCatalogProviderType, WorkspaceByokCatalogType, WorkspaceByokEndpointType,
  WorkspaceByokModelDeclarationType, WorkspaceByokModelProbeCheckType, WorkspaceByokModelProbeType,
  WorkspaceByokPolicyType, WorkspaceByokProbeResultType, WorkspaceByokProbeStatusType,
  WorkspaceByokProfileDefinitionInput, WorkspaceByokProfileDefinitionType, WorkspaceByokProfileType,
  WorkspaceByokSettingsType, WorkspaceByokUsagePointType, WorkspaceByokValidationType,
};
use crate::legacy_compat::quota::SafeInt;

pub(super) fn definition_to_dto(input: WorkspaceByokProfileDefinitionInput) -> ByokProfileDefinitionDto {
  ByokProfileDefinitionDto {
    endpoint: ByokEndpointDto {
      kind: input.endpoint.kind.as_str().to_owned(),
      url: input.endpoint.url,
      dialect: input.endpoint.dialect.map(|d| d.as_str().to_owned()),
    },
    models: input
      .models
      .into_iter()
      .map(|m| ByokModelDeclarationDto {
        model_id: m.model_id,
        enabled: m.enabled,
        capabilities: m
          .capabilities
          .into_iter()
          .map(|c| ByokCapabilityDto {
            input: c.input.into_iter().map(|v| v.as_str().to_owned()).collect(),
            output: c.output.into_iter().map(|v| v.as_str().to_owned()).collect(),
            features: c.features.into_iter().map(|v| v.as_str().to_owned()).collect(),
            attachment_kinds: c.attachment_kinds.into_iter().map(|v| v.as_str().to_owned()).collect(),
            attachment_sources: c
              .attachment_sources
              .into_iter()
              .map(|v| v.as_str().to_owned())
              .collect(),
          })
          .collect(),
      })
      .collect(),
  }
}

fn capability_from_dto(dto: ByokCapabilityDto) -> Result<WorkspaceByokCapabilityType, DomainError> {
  Ok(WorkspaceByokCapabilityType {
    input: dto
      .input
      .iter()
      .map(|s| ByokModelInput::parse(s))
      .collect::<Result<_, _>>()?,
    output: dto
      .output
      .iter()
      .map(|s| ByokModelOutput::parse(s))
      .collect::<Result<_, _>>()?,
    features: dto
      .features
      .iter()
      .map(|s| ByokModelFeature::parse(s))
      .collect::<Result<_, _>>()?,
    attachment_kinds: dto
      .attachment_kinds
      .iter()
      .map(|s| ByokAttachmentKind::parse(s))
      .collect::<Result<_, _>>()?,
    attachment_sources: dto
      .attachment_sources
      .iter()
      .map(|s| ByokAttachmentSource::parse(s))
      .collect::<Result<_, _>>()?,
  })
}

fn definition_from_dto(dto: ByokProfileDefinitionDto) -> Result<WorkspaceByokProfileDefinitionType, DomainError> {
  Ok(WorkspaceByokProfileDefinitionType {
    endpoint: WorkspaceByokEndpointType {
      kind: ByokEndpointKind::parse(&dto.endpoint.kind)?,
      url: dto.endpoint.url,
      dialect: dto
        .endpoint
        .dialect
        .as_deref()
        .map(ByokOpenAiDialect::parse)
        .transpose()?,
    },
    models: dto
      .models
      .into_iter()
      .map(|m| {
        Ok(WorkspaceByokModelDeclarationType {
          model_id: m.model_id,
          enabled: m.enabled,
          capabilities: m
            .capabilities
            .into_iter()
            .map(capability_from_dto)
            .collect::<Result<_, _>>()?,
        })
      })
      .collect::<Result<_, _>>()?,
  })
}

fn probe_status_from_dto(dto: ByokProbeStatusDto) -> Result<WorkspaceByokProbeStatusType, DomainError> {
  let tested_at = dto
    .tested_at_ms
    .map(|ms| {
      Utc
        .timestamp_millis_opt(ms)
        .single()
        .ok_or_else(|| DomainError::Internal(format!("invalid probe timestamp: {ms}")))
    })
    .transpose()?;
  Ok(WorkspaceByokProbeStatusType {
    kind: ByokProbeStatusKind::parse(&dto.kind)?,
    tested_at,
    error_kind: dto.error_kind,
  })
}

fn model_probes_from_dto(models: Vec<ByokModelProbeDto>) -> Result<Vec<WorkspaceByokModelProbeType>, DomainError> {
  models
    .into_iter()
    .map(|m| {
      Ok(WorkspaceByokModelProbeType {
        model_id: m.model_id,
        checks: m
          .checks
          .into_iter()
          .map(|c| {
            Ok(WorkspaceByokModelProbeCheckType {
              operation: ByokProbeOperation::parse(&c.operation)?,
              status: probe_status_from_dto(c.status)?,
            })
          })
          .collect::<Result<_, _>>()?,
      })
    })
    .collect()
}

fn validation_from_dto(dto: ByokValidationDto) -> Result<WorkspaceByokValidationType, DomainError> {
  Ok(WorkspaceByokValidationType {
    definition_fingerprint: dto.definition_fingerprint,
    credential_generation: SafeInt(dto.credential_generation),
    connection: probe_status_from_dto(dto.connection)?,
    models: model_probes_from_dto(dto.models)?,
  })
}

pub(super) fn probe_result_from_dto(dto: ByokProbeResultDto) -> Result<WorkspaceByokProbeResultType, DomainError> {
  Ok(WorkspaceByokProbeResultType {
    definition_fingerprint: dto.definition_fingerprint,
    stale: dto.stale,
    connection: probe_status_from_dto(dto.connection)?,
    models: model_probes_from_dto(dto.models)?,
  })
}

pub(super) fn profile_from_dto(dto: ByokProfileDto) -> Result<WorkspaceByokProfileType, DomainError> {
  Ok(WorkspaceByokProfileType {
    profile_id: ID(dto.profile_id),
    workspace_id: dto.workspace_id,
    provider: ByokProvider::parse(&dto.provider)?,
    name: dto.name,
    description: dto.description,
    definition: definition_from_dto(dto.definition)?,
    enabled: dto.enabled,
    sort_order: SafeInt(dto.sort_order),
    revision: SafeInt(dto.revision),
    validation: dto.validation.map(validation_from_dto).transpose()?,
  })
}

fn catalog_from_dto(dto: ByokCatalogDto) -> Result<WorkspaceByokCatalogType, DomainError> {
  Ok(WorkspaceByokCatalogType {
    version: dto.version,
    providers: dto
      .providers
      .into_iter()
      .map(|p| {
        Ok(WorkspaceByokCatalogProviderType {
          provider: ByokProvider::parse(&p.provider)?,
          models: p
            .models
            .into_iter()
            .map(|m| {
              Ok(WorkspaceByokCatalogModelType {
                model_id: m.model_id,
                display_name: m.display_name,
                recommended: m.recommended,
                capabilities: m
                  .capabilities
                  .into_iter()
                  .map(capability_from_dto)
                  .collect::<Result<_, _>>()?,
              })
            })
            .collect::<Result<_, _>>()?,
        })
      })
      .collect::<Result<_, _>>()?,
  })
}

fn policy_from_dto(dto: ByokPolicyDto) -> Result<WorkspaceByokPolicyType, DomainError> {
  Ok(WorkspaceByokPolicyType {
    enabled: dto.enabled,
    allowed_providers: dto
      .allowed_providers
      .iter()
      .map(|s| ByokProvider::parse(s))
      .collect::<Result<_, _>>()?,
    custom_endpoint_mode: ByokCustomEndpointMode::parse(&dto.custom_endpoint_mode)?,
    private_endpoint_supported: dto.private_endpoint_supported,
  })
}

pub(super) fn settings_from_dto(dto: ByokSettingsDto) -> Result<WorkspaceByokSettingsType, DomainError> {
  Ok(WorkspaceByokSettingsType {
    workspace_id: dto.workspace_id,
    entitled: dto.entitled,
    server_entitled: dto.server_entitled,
    local_entitled: dto.local_entitled,
    profiles: dto
      .profiles
      .into_iter()
      .map(profile_from_dto)
      .collect::<Result<_, _>>()?,
    policy: policy_from_dto(dto.policy)?,
    catalog: catalog_from_dto(dto.catalog)?,
  })
}

pub(super) fn usage_from_dto(dto: ByokUsagePointDto) -> WorkspaceByokUsagePointType {
  WorkspaceByokUsagePointType {
    date: dto.date,
    feature_kind: dto.feature_kind,
    total_tokens: SafeInt(dto.total_tokens),
  }
}

pub(super) fn local_lease_from_dto(dto: ByokLocalLeaseDto) -> CreateWorkspaceByokLocalLeaseResultType {
  CreateWorkspaceByokLocalLeaseResultType {
    lease_id: dto.lease_id,
    expires_at: dto.expires_at,
  }
}
