import type { ByokFeatureKind } from '../byok/types';

export type ByokSourceCoverage = {
  local: boolean;
  server: boolean;
};

const DEFAULT_BYOK_COVERAGE: ByokSourceCoverage = {
  local: true,
  server: true,
};

const BYOK_FEATURE_COVERAGE: Partial<
  Record<ByokFeatureKind, ByokSourceCoverage>
> = {
  transcript: { local: false, server: true },
  embedding: { local: false, server: true },
  workspace_indexing: { local: false, server: true },
  rerank: { local: false, server: false },
};

export function getByokSourceCoverage(
  featureKind?: ByokFeatureKind
): ByokSourceCoverage {
  return featureKind
    ? (BYOK_FEATURE_COVERAGE[featureKind] ?? DEFAULT_BYOK_COVERAGE)
    : DEFAULT_BYOK_COVERAGE;
}
