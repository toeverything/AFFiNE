import type { LlmBackendConfig, LlmProtocol } from '../../../../native';
import { llmPlanAttachmentReference } from '../../../../native';
import type { PromptAttachment } from '../../providers/types';
import {
  type AdmittedAttachmentSource,
  admittedAttachmentToPromptAttachment,
} from './attachment-admission';

export type AdmittedAttachmentMaterializationPlan = {
  mode: 'inline';
  reason: 'admitted_bytes';
  attachment: PromptAttachment;
};

export type HostAttachmentMaterializationRequest = {
  attachmentId: string;
  target: 'bytes' | 'data';
  providerConstraint?: string;
  maxSize: number;
  timeoutMs: number;
  redirectPolicy: 'follow-safe';
  expectedMime?: string;
  url: string;
};

type RemoteReferenceReason =
  | 'generic_remote_reference'
  | 'gemini_api_file_uri'
  | 'gemini_api_youtube_url';

type MaterializationRequestReason =
  | 'generic_remote_reference'
  | 'gemini_api_inline_http_url'
  | 'unsupported_scheme'
  | 'non_url_source';

function assertRemoteReferenceReason(
  reason: string
): asserts reason is RemoteReferenceReason {
  if (
    reason !== 'generic_remote_reference' &&
    reason !== 'gemini_api_file_uri' &&
    reason !== 'gemini_api_youtube_url'
  ) {
    throw new Error(`Unexpected remote attachment reference reason: ${reason}`);
  }
}

function assertMaterializationRequestReason(
  reason: string
): asserts reason is MaterializationRequestReason {
  if (
    reason !== 'gemini_api_inline_http_url' &&
    reason !== 'generic_remote_reference' &&
    reason !== 'unsupported_scheme' &&
    reason !== 'non_url_source'
  ) {
    throw new Error(`Unexpected attachment materialization reason: ${reason}`);
  }
}

export async function planHostUrlAttachmentMaterialization(
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  input: {
    attachmentId: string;
    url: string;
    expectedMime?: string;
    maxSize: number;
    timeoutMs?: number;
  }
): Promise<
  | {
      mode: 'remote_reference';
      reason:
        | 'generic_remote_reference'
        | 'gemini_api_file_uri'
        | 'gemini_api_youtube_url';
      url: string;
    }
  | {
      mode: 'materialization_request';
      reason:
        | 'generic_remote_reference'
        | 'gemini_api_inline_http_url'
        | 'unsupported_scheme'
        | 'non_url_source';
      request: HostAttachmentMaterializationRequest;
    }
> {
  const plan = await llmPlanAttachmentReference(protocol, backendConfig, {
    url: input.url,
  });
  const forceHostMaterialization =
    protocol === 'gemini' &&
    backendConfig.request_layer === 'gemini_vertex' &&
    plan.reason === 'generic_remote_reference';

  if (plan.mode === 'remote' && !forceHostMaterialization) {
    assertRemoteReferenceReason(plan.reason);
    return {
      mode: 'remote_reference',
      reason: plan.reason,
      url: input.url,
    };
  }

  assertMaterializationRequestReason(plan.reason);
  return {
    mode: 'materialization_request',
    reason: plan.reason,
    request: {
      attachmentId: input.attachmentId,
      target: 'bytes',
      providerConstraint: protocol,
      maxSize: input.maxSize,
      timeoutMs: input.timeoutMs ?? 15_000,
      redirectPolicy: 'follow-safe',
      expectedMime: input.expectedMime,
      url: input.url,
    },
  };
}

export function planAdmittedAttachmentMaterialization(
  source: AdmittedAttachmentSource
): AdmittedAttachmentMaterializationPlan {
  return {
    mode: 'inline',
    reason: 'admitted_bytes',
    attachment: admittedAttachmentToPromptAttachment(source),
  };
}
