import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export function toToolJsonSchema(schema: unknown): Record<string, unknown> {
  if (!(schema instanceof z.ZodType)) {
    if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
      return schema as Record<string, unknown>;
    }
    return { type: 'object', properties: {} };
  }

  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    effectStrategy: 'input',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;
  delete jsonSchema.$schema;

  return jsonSchema;
}
