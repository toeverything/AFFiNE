import serverNativeModule, {
  type CapabilityMatchRequest,
  type CapabilityMatchResponse,
  type ModelRegistryMatchRequest,
  type ModelRegistryMatchResponse,
  type ModelRegistryResolveRequest,
  type ModelRegistryResolveResponse,
  type ModelRegistryVariantContract,
  type ProviderDriverSpec,
  type RequestedModelMatchRequest,
  type RequestedModelMatchResponse,
} from '@affine/server-native';

// Owner: native/Rust contract facade.
// These types and validators intentionally proxy @affine/server-native and
// must not grow independent runtime semantics in Node.
export type {
  CapabilityMatchRequest,
  CapabilityMatchResponse,
  ProviderDriverSpec,
  RequestedModelMatchRequest,
  RequestedModelMatchResponse,
};

export type CopilotModelBackendKind = ModelRegistryMatchRequest['backendKind'];
export type ModelRegistryVariant = ModelRegistryVariantContract;
export type ResolveModelRegistryVariantRequest = ModelRegistryResolveRequest;
export type ResolveModelRegistryVariantResponse = ModelRegistryResolveResponse;
export type MatchModelRegistryRequest = ModelRegistryMatchRequest;
export type MatchModelRegistryResponse = ModelRegistryMatchResponse;

function validateNativeContract<T>(name: string, value: unknown): T {
  return serverNativeModule.llmValidateContract(name, value) as T;
}

export function parseCapabilityMatchRequest(value: unknown) {
  return validateNativeContract<CapabilityMatchRequest>(
    'capabilityMatchRequest',
    value
  );
}

export function parseCapabilityMatchResponse(value: unknown) {
  return validateNativeContract<CapabilityMatchResponse>(
    'capabilityMatchResponse',
    value
  );
}

export function parseResolveModelRegistryVariantRequest(value: unknown) {
  return validateNativeContract<ResolveModelRegistryVariantRequest>(
    'modelRegistryResolveRequest',
    value
  );
}

export function parseResolveModelRegistryVariantResponse(value: unknown) {
  return validateNativeContract<ResolveModelRegistryVariantResponse>(
    'modelRegistryResolveResponse',
    value
  );
}

export function parseMatchModelRegistryRequest(value: unknown) {
  return validateNativeContract<MatchModelRegistryRequest>(
    'modelRegistryMatchRequest',
    value
  );
}

export function parseMatchModelRegistryResponse(value: unknown) {
  return validateNativeContract<MatchModelRegistryResponse>(
    'modelRegistryMatchResponse',
    value
  );
}

export function parseProviderDriverSpec(value: unknown) {
  return validateNativeContract<ProviderDriverSpec>(
    'providerDriverSpec',
    value
  );
}

export function parseRequestedModelMatchRequest(value: unknown) {
  return validateNativeContract<RequestedModelMatchRequest>(
    'requestedModelMatchRequest',
    value
  );
}

export function parseRequestedModelMatchResponse(value: unknown) {
  return validateNativeContract<RequestedModelMatchResponse>(
    'requestedModelMatchResponse',
    value
  );
}
