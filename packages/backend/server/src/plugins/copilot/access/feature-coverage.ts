import type { ByokFeatureKind } from '../byok/types';

export type ByokSourceCoverage = {
  local: boolean;
  server: boolean;
};

export type CopilotFeatureAccessRule = ByokSourceCoverage & {
  quotaMetered: boolean;
};

const DEFAULT_BYOK_COVERAGE: ByokSourceCoverage = {
  local: true,
  server: true,
};

const DEFAULT_FEATURE_ACCESS: CopilotFeatureAccessRule = {
  ...DEFAULT_BYOK_COVERAGE,
  quotaMetered: true,
};

const COPILOT_FEATURE_ACCESS: Partial<
  Record<ByokFeatureKind, CopilotFeatureAccessRule>
> = {
  transcript: { local: false, server: true, quotaMetered: true },
  embedding: { local: false, server: true, quotaMetered: false },
  workspace_indexing: { local: false, server: true, quotaMetered: false },
  rerank: { local: false, server: true, quotaMetered: false },
};

export function getByokSourceCoverage(
  featureKind?: ByokFeatureKind
): ByokSourceCoverage {
  const access = getCopilotFeatureAccess(featureKind);
  return { local: access.local, server: access.server };
}

export function getCopilotFeatureAccess(
  featureKind?: ByokFeatureKind
): CopilotFeatureAccessRule {
  return featureKind
    ? (COPILOT_FEATURE_ACCESS[featureKind] ?? DEFAULT_FEATURE_ACCESS)
    : DEFAULT_FEATURE_ACCESS;
}
