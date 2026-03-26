import { AiPromptRole } from '@prisma/client';
import { z } from 'zod';

import { JSONSchema } from '../../../base';

// ========== provider ==========

export enum CopilotProviderType {
  Anthropic = 'anthropic',
  AnthropicVertex = 'anthropicVertex',
  CloudflareWorkersAi = 'cloudflareWorkersAi',
  FAL = 'fal',
  Gemini = 'gemini',
  GeminiVertex = 'geminiVertex',
  OpenAI = 'openai',
  Perplexity = 'perplexity',
  Morph = 'morph',
}

export const CopilotProviderSchema = z.object({
  type: z.nativeEnum(CopilotProviderType),
});

export const VertexSchema: JSONSchema = {
  type: 'object',
  description: 'The config for the google vertex provider.',
  properties: {
    location: {
      type: 'string',
      description: 'The location of the google vertex provider.',
    },
    project: {
      type: 'string',
      description: 'The project name of the google vertex provider.',
    },
    googleAuthOptions: {
      type: 'object',
      description: 'The google auth options for the google vertex provider.',
      properties: {
        credentials: {
          type: 'object',
          description: 'The credentials for the google vertex provider.',
          properties: {
            client_email: {
              type: 'string',
              description: 'The client email for the google vertex provider.',
            },
            private_key: {
              type: 'string',
              description: 'The private key for the google vertex provider.',
            },
          },
        },
      },
    },
  },
};

// ========== prompt ==========

export const PromptToolsSchema = z
  .enum([
    'blobRead',
    'codeArtifact',
    'conversationSummary',
    // work with morph
    'docEdit',
    // work with indexer
    'docRead',
    'docCreate',
    'docUpdate',
    'docUpdateMeta',
    'docKeywordSearch',
    // work with embeddings
    'docSemanticSearch',
    // work with exa/model internal tools
    'webSearch',
    // artifact tools
    'docCompose',
    // section editing
    'sectionEdit',
  ])
  .array();

export const PromptConfigStrictSchema = z.object({
  tools: PromptToolsSchema.nullable().optional(),
  proModels: z.array(z.string()).nullable().optional(),
  // params requirements
  requireContent: z.boolean().nullable().optional(),
  requireAttachment: z.boolean().nullable().optional(),
  // structure output
  maxRetries: z.number().nullable().optional(),
  // openai
  frequencyPenalty: z.number().nullable().optional(),
  presencePenalty: z.number().nullable().optional(),
  temperature: z.number().nullable().optional(),
  topP: z.number().nullable().optional(),
  maxTokens: z.number().nullable().optional(),
  // fal
  modelName: z.string().nullable().optional(),
  loras: z
    .array(
      z.object({ path: z.string(), scale: z.number().nullable().optional() })
    )
    .nullable()
    .optional(),
  // google
  audioTimestamp: z.boolean().nullable().optional(),
});

export const PromptConfigSchema =
  PromptConfigStrictSchema.nullable().optional();

export type PromptConfig = z.infer<typeof PromptConfigSchema>;

export type PromptTools = z.infer<typeof PromptToolsSchema>;

// ========== message ==========

export const EmbeddingMessage = z.array(z.string().trim().min(1)).min(1);

export const ChatMessageRole = Object.values(AiPromptRole) as [
  'system',
  'assistant',
  'user',
];

const AttachmentUrlSchema = z.string().refine(value => {
  if (value.startsWith('data:')) {
    return true;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' ||
      url.protocol === 'https:' ||
      url.protocol === 'gs:'
    );
  } catch {
    return false;
  }
}, 'attachments must use https?://, gs:// or data: urls');

export const PromptAttachmentSourceKindSchema = z.enum([
  'url',
  'data',
  'bytes',
  'file_handle',
]);

export const PromptAttachmentKindSchema = z.enum(['image', 'audio', 'file']);

const AttachmentProviderHintSchema = z
  .object({
    provider: z.nativeEnum(CopilotProviderType).optional(),
    kind: PromptAttachmentKindSchema.optional(),
  })
  .strict();

const PromptAttachmentSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('url'),
      url: AttachmentUrlSchema,
      mimeType: z.string().optional(),
      fileName: z.string().optional(),
      providerHint: AttachmentProviderHintSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('data'),
      data: z.string(),
      mimeType: z.string(),
      encoding: z.enum(['base64', 'utf8']).optional(),
      fileName: z.string().optional(),
      providerHint: AttachmentProviderHintSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('bytes'),
      data: z.string(),
      mimeType: z.string(),
      encoding: z.literal('base64').optional(),
      fileName: z.string().optional(),
      providerHint: AttachmentProviderHintSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('file_handle'),
      fileHandle: z.string().trim().min(1),
      mimeType: z.string().optional(),
      fileName: z.string().optional(),
      providerHint: AttachmentProviderHintSchema.optional(),
    })
    .strict(),
]);

export const ChatMessageAttachment = z.union([
  AttachmentUrlSchema,
  z.object({
    attachment: AttachmentUrlSchema,
    mimeType: z.string(),
  }),
  PromptAttachmentSchema,
]);

export const PromptResponseFormatSchema = z
  .object({
    type: z.literal('json_schema'),
    schema: z.any(),
    strict: z.boolean().optional(),
  })
  .strict();

export const StreamObjectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text-delta'),
    textDelta: z.string(),
  }),
  z.object({
    type: z.literal('reasoning'),
    textDelta: z.string(),
  }),
  z.object({
    type: z.literal('tool-call'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.record(z.any()),
  }),
  z.object({
    type: z.literal('tool-result'),
    toolCallId: z.string(),
    toolName: z.string(),
    args: z.record(z.any()),
    result: z.any(),
  }),
]);

export const PureMessageSchema = z.object({
  content: z.string(),
  streamObjects: z.array(StreamObjectSchema).optional().nullable(),
  attachments: z.array(ChatMessageAttachment).optional().nullable(),
  params: z.record(z.any()).optional().nullable(),
  responseFormat: PromptResponseFormatSchema.optional().nullable(),
});

export const PromptMessageSchema = PureMessageSchema.extend({
  role: z.enum(ChatMessageRole),
}).strict();
export type PromptMessage = z.infer<typeof PromptMessageSchema>;
export type PromptParams = NonNullable<PromptMessage['params']>;
export type StreamObject = z.infer<typeof StreamObjectSchema>;
export type PromptAttachment = z.infer<typeof ChatMessageAttachment>;
export type PromptAttachmentSourceKind = z.infer<
  typeof PromptAttachmentSourceKindSchema
>;
export type PromptAttachmentKind = z.infer<typeof PromptAttachmentKindSchema>;
export type PromptResponseFormat = z.infer<typeof PromptResponseFormatSchema>;

// ========== options ==========

const CopilotProviderOptionsSchema = z.object({
  signal: z.instanceof(AbortSignal).optional(),
  user: z.string().optional(),
  session: z.string().optional(),
  workspace: z.string().optional(),
});

export const CopilotChatOptionsSchema = CopilotProviderOptionsSchema.merge(
  PromptConfigStrictSchema
)
  .extend({
    reasoning: z.boolean().optional(),
    webSearch: z.boolean().optional(),
  })
  .optional();

export type CopilotChatOptions = z.infer<typeof CopilotChatOptionsSchema>;
export type CopilotChatTools = NonNullable<
  NonNullable<CopilotChatOptions>['tools']
>[number];

export const CopilotStructuredOptionsSchema =
  CopilotProviderOptionsSchema.merge(PromptConfigStrictSchema)
    .extend({ schema: z.any().optional(), strict: z.boolean().optional() })
    .optional();

export type CopilotStructuredOptions = z.infer<
  typeof CopilotStructuredOptionsSchema
>;

export const CopilotImageOptionsSchema = CopilotProviderOptionsSchema.merge(
  PromptConfigStrictSchema
)
  .extend({
    quality: z.string().optional(),
    seed: z.number().optional(),
  })
  .optional();

export type CopilotImageOptions = z.infer<typeof CopilotImageOptionsSchema>;

export const CopilotEmbeddingOptionsSchema =
  CopilotProviderOptionsSchema.extend({
    dimensions: z.number(),
  }).optional();

export type CopilotEmbeddingOptions = z.infer<
  typeof CopilotEmbeddingOptionsSchema
>;

export type CopilotRerankCandidate = {
  id?: string;
  text: string;
};

export type CopilotRerankRequest = {
  query: string;
  candidates: CopilotRerankCandidate[];
  topK?: number;
};

export enum ModelInputType {
  Text = 'text',
  Image = 'image',
  Audio = 'audio',
  File = 'file',
}

export enum ModelOutputType {
  Text = 'text',
  Object = 'object',
  Embedding = 'embedding',
  Image = 'image',
  Rerank = 'rerank',
  Structured = 'structured',
}

export interface ModelAttachmentCapability {
  kinds: PromptAttachmentKind[];
  sourceKinds?: PromptAttachmentSourceKind[];
  allowRemoteUrls?: boolean;
}

export interface ModelCapability {
  input: ModelInputType[];
  output: ModelOutputType[];
  attachments?: ModelAttachmentCapability;
  structuredAttachments?: ModelAttachmentCapability;
  defaultForOutputType?: boolean;
}

export interface CopilotProviderModel {
  id: string;
  name?: string;
  capabilities: ModelCapability[];
}

export type ModelConditions = {
  inputTypes?: ModelInputType[];
  attachmentKinds?: PromptAttachmentKind[];
  attachmentSourceKinds?: PromptAttachmentSourceKind[];
  hasRemoteAttachments?: boolean;
  modelId?: string;
};

export type ModelFullConditions = ModelConditions & {
  outputType?: ModelOutputType;
};
