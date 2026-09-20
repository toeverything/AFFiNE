import { llmCanonicalJsonSchemaHash } from '../../../../native';
import { toToolJsonSchema } from '../../tools/json-schema';
import type { JsonValue } from './shared';

// Owner: tool-authoring compatibility plus native schema hash facade.
// Zod-to-JSON-Schema conversion stays in Node for tool authoring, but canonical
// schema hashing is delegated to Rust so JSON key order is not semantic.
export type StructuredOutputValidator = {
  parse(input: unknown): unknown;
  safeParse(input: unknown): unknown;
};

export type StructuredOutputContract = {
  responseSchemaJson?: Record<string, unknown>;
  schemaHash?: string;
  strict?: boolean;
};

export type RequiredStructuredOutputContract = StructuredOutputContract & {
  responseSchemaJson: Record<string, unknown>;
  schemaHash: string;
};

type StructuredResponseFormatLike = {
  type?: string | null;
  responseSchemaJson?: Record<string, unknown>;
  schemaHash?: string;
  strict?: boolean;
} | null;

type StructuredResponseFormatProjection = {
  nativeResponseFormat?: {
    type: 'json_schema';
    responseSchemaJson: Record<string, JsonValue>;
    schemaHash: string;
    strict?: boolean;
  };
  hostResponseFormat?: {
    type: 'json_schema';
    responseSchemaJson?: Record<string, unknown>;
    schemaHash?: string;
    strict?: boolean;
  };
};

export type StructuredOutputContractFields = Pick<
  StructuredOutputContract,
  'responseSchemaJson' | 'schemaHash' | 'strict'
>;

export function buildStructuredResponseFromSchemaJson(
  responseSchemaJson?: Record<string, unknown>
): StructuredOutputContract {
  if (!responseSchemaJson) return {};
  const schemaHash = ensurePromptResponseSchemaHash(responseSchemaJson);
  return { responseSchemaJson, schemaHash };
}

export function ensurePromptResponseSchemaHash(
  schemaJson?: Record<string, unknown>,
  schemaHash?: string
) {
  if (schemaHash || !schemaJson) return schemaHash;
  return llmCanonicalJsonSchemaHash(schemaJson);
}

export function isStructuredOutputValidator(
  schema: unknown
): schema is StructuredOutputValidator {
  return (
    !!schema &&
    typeof schema === 'object' &&
    'parse' in schema &&
    typeof schema.parse === 'function' &&
    'safeParse' in schema &&
    typeof schema.safeParse === 'function'
  );
}

export function buildStructuredResponseContract(
  schema?: unknown
): StructuredOutputContract {
  if (isStructuredOutputValidator(schema)) {
    return buildStructuredResponseFromSchemaJson(
      toToolJsonSchema(schema) as Record<string, JsonValue>
    );
  }

  if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
    return buildStructuredResponseFromSchemaJson(
      schema as Record<string, JsonValue>
    );
  }

  return {};
}

export function buildPromptStructuredResponseFromFields(
  fields?: StructuredOutputContractFields | null
): StructuredOutputContract | undefined {
  if (!fields) {
    return;
  }

  const { responseSchemaJson, schemaHash, strict } = fields;
  const normalizedSchemaHash = ensurePromptResponseSchemaHash(
    responseSchemaJson,
    schemaHash
  );
  if (!responseSchemaJson) {
    return;
  }

  return {
    ...(responseSchemaJson ? { responseSchemaJson } : {}),
    ...(normalizedSchemaHash ? { schemaHash: normalizedSchemaHash } : {}),
    ...(strict !== undefined ? { strict } : {}),
  };
}

export function buildPromptStructuredResponseContractFromResponseFormat(
  responseFormat?: StructuredResponseFormatLike
): StructuredOutputContract | undefined {
  if (responseFormat?.type !== 'json_schema') {
    return;
  }

  const responseSchemaJson = responseFormat.responseSchemaJson;
  const schemaHash = ensurePromptResponseSchemaHash(
    responseSchemaJson,
    responseFormat.schemaHash
  );

  if (!responseSchemaJson) {
    return;
  }

  return {
    ...(responseSchemaJson ? { responseSchemaJson } : {}),
    ...(schemaHash ? { schemaHash } : {}),
    ...(responseFormat.strict !== undefined
      ? { strict: responseFormat.strict }
      : {}),
  };
}

export function normalizePromptResponseFormat(
  responseFormat?: StructuredResponseFormatLike
): StructuredResponseFormatProjection {
  if (responseFormat?.type !== 'json_schema') {
    return {};
  }

  const contract =
    buildPromptStructuredResponseContractFromResponseFormat(responseFormat);
  if (!contract) {
    return {};
  }

  const nextNativeResponseFormat =
    contract.responseSchemaJson && contract.schemaHash
      ? {
          type: 'json_schema' as const,
          responseSchemaJson: contract.responseSchemaJson as Record<
            string,
            JsonValue
          >,
          schemaHash: contract.schemaHash,
          ...(responseFormat.strict !== undefined
            ? { strict: responseFormat.strict }
            : {}),
        }
      : undefined;
  const nextHostResponseFormat = {
    type: 'json_schema' as const,
    ...(contract.responseSchemaJson
      ? { responseSchemaJson: contract.responseSchemaJson }
      : {}),
    ...(contract.schemaHash ? { schemaHash: contract.schemaHash } : {}),
    ...(responseFormat.strict !== undefined
      ? { strict: responseFormat.strict }
      : {}),
  };

  return {
    nativeResponseFormat: nextNativeResponseFormat,
    hostResponseFormat: contract.responseSchemaJson
      ? nextHostResponseFormat
      : undefined,
  };
}

export function requireStructuredOutputContract(
  contract?: StructuredOutputContract
): RequiredStructuredOutputContract | undefined {
  if (!contract?.responseSchemaJson || !contract.schemaHash) {
    return;
  }

  return {
    responseSchemaJson: contract.responseSchemaJson,
    schemaHash: contract.schemaHash,
    ...(contract.strict !== undefined ? { strict: contract.strict } : {}),
  };
}
