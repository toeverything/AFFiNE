import assert from 'node:assert';

import {
  config as falConfig,
  stream as falStream,
} from '@fal-ai/serverless-client';
import { z, ZodType } from 'zod';

import {
  CopilotPromptInvalid,
  CopilotProviderSideError,
  metrics,
  UserFriendlyError,
} from '../../../fundamentals';
import {
  CopilotCapability,
  CopilotChatOptions,
  CopilotImageOptions,
  CopilotImageToImageProvider,
  CopilotProviderType,
  CopilotTextToImageProvider,
  PromptMessage,
} from '../types';

export type FalConfig = {
  apiKey: string;
};

const FalImageSchema = z
  .object({
    url: z.string(),
    seed: z.number().nullable().optional(),
    content_type: z.string(),
    file_name: z.string().nullable().optional(),
    file_size: z.number().nullable().optional(),
    width: z.number(),
    height: z.number(),
  })
  .optional();

type FalImage = z.infer<typeof FalImageSchema>;

const FalResponseSchema = z.object({
  detail: z
    .union([
      z.array(z.object({ type: z.string(), msg: z.string() })),
      z.string(),
    ])
    .optional(),
  images: z.array(FalImageSchema).nullable().optional(),
  image: FalImageSchema.nullable().optional(),
  output: z.string().nullable().optional(),
});

type FalResponse = z.infer<typeof FalResponseSchema>;

const FalStreamOutputSchema = z.object({
  type: z.literal('output'),
  output: FalResponseSchema,
});

type FalPrompt = {
  model_name?: string;
  image_url?: string;
  prompt?: string;
  loras?: { path: string; scale?: number }[];
  controlnets?: {
    image_url: string;
    start_percentage?: number;
    end_percentage?: number;
  }[];
};

export class FalProvider
  implements CopilotTextToImageProvider, CopilotImageToImageProvider
{
  static readonly type = CopilotProviderType.FAL;
  static readonly capabilities = [
    CopilotCapability.TextToImage,
    CopilotCapability.ImageToImage,
    CopilotCapability.ImageToText,
  ];

  readonly availableModels = [
    // text to image
    'fast-turbo-diffusion',
    // image to image
    'lcm-sd15-i2i',
    'clarity-upscaler',
    'face-to-sticker',
    'imageutils/rembg',
    'fast-sdxl/image-to-image',
    'workflowutils/teed',
    'lora/image-to-image',
    // image to text
    'llava-next',
  ];

  constructor(private readonly config: FalConfig) {
    assert(FalProvider.assetsConfig(config));
    falConfig({ credentials: this.config.apiKey });
  }

  static assetsConfig(config: FalConfig) {
    return !!config.apiKey;
  }

  get type(): CopilotProviderType {
    return FalProvider.type;
  }

  getCapabilities(): CopilotCapability[] {
    return FalProvider.capabilities;
  }

  async isModelAvailable(model: string): Promise<boolean> {
    return this.availableModels.includes(model);
  }

  private extractArray<T>(value: T | T[] | undefined): T[] {
    if (Array.isArray(value)) return value;
    return value ? [value] : [];
  }

  private extractPrompt(
    message?: PromptMessage,
    options: CopilotImageOptions = {}
  ): FalPrompt {
    if (!message) throw new CopilotPromptInvalid('Prompt is empty');
    const { content, attachments, params } = message;
    // prompt attachments require at least one
    if (!content && (!Array.isArray(attachments) || !attachments.length)) {
      throw new CopilotPromptInvalid('Prompt or Attachments is empty');
    }
    if (Array.isArray(attachments) && attachments.length > 1) {
      throw new CopilotPromptInvalid('Only one attachment is allowed');
    }
    const lora = [
      ...this.extractArray(params?.lora),
      ...this.extractArray(options.loras),
    ].filter(
      (v): v is { path: string; scale?: number } =>
        !!v && typeof v === 'object' && typeof v.path === 'string'
    );
    const controlnets = this.extractArray(params?.controlnets).filter(
      (v): v is { image_url: string } =>
        !!v && typeof v === 'object' && typeof v.image_url === 'string'
    );
    return {
      model_name: options.modelName || undefined,
      image_url: attachments?.[0],
      prompt: content.trim(),
      loras: lora.length ? lora : undefined,
      controlnets: controlnets.length ? controlnets : undefined,
    };
  }

  private extractFalError(
    resp: FalResponse,
    message?: string
  ): CopilotProviderSideError {
    if (Array.isArray(resp.detail) && resp.detail.length) {
      const error = resp.detail[0].msg;
      return new CopilotProviderSideError({
        provider: this.type,
        kind: resp.detail[0].type,
        message: message ? `${message}: ${error}` : error,
      });
    } else if (typeof resp.detail === 'string') {
      const error = resp.detail;
      return new CopilotProviderSideError({
        provider: this.type,
        kind: resp.detail,
        message: message ? `${message}: ${error}` : error,
      });
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unknown',
      message: 'No content generated',
    });
  }

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      // pass through user friendly errors
      return e;
    } else {
      const error = new CopilotProviderSideError({
        provider: this.type,
        kind: 'unexpected_response',
        message: e?.message || 'Unexpected fal response',
      });
      return error;
    }
  }

  private parseSchema<R>(schema: ZodType<R>, data: unknown): R {
    const result = schema.safeParse(data);
    if (result.success) return result.data;
    const errors = JSON.stringify(result.error.errors);
    throw new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: `Unexpected fal response: ${errors}`,
    });
  }

  async generateText(
    messages: PromptMessage[],
    model: string = 'llava-next',
    options: CopilotChatOptions = {}
  ): Promise<string> {
    if (!this.availableModels.includes(model)) {
      throw new CopilotPromptInvalid(`Invalid model: ${model}`);
    }

    // by default, image prompt assumes there is only one message
    const prompt = this.extractPrompt(messages.pop());
    try {
      metrics.ai.counter('chat_text_calls').add(1, { model });
      const response = await fetch(`https://fal.run/fal-ai/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `key ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...prompt,
          sync_mode: true,
          enable_safety_checks: false,
        }),
        signal: options.signal,
      });

      const data = this.parseSchema(FalResponseSchema, await response.json());
      if (!data.output) {
        throw this.extractFalError(data, 'Failed to generate text');
      }
      return data.output;
    } catch (e: any) {
      metrics.ai.counter('chat_text_errors').add(1, { model });
      throw this.handleError(e);
    }
  }

  async *generateTextStream(
    messages: PromptMessage[],
    model: string = 'llava-next',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    try {
      metrics.ai.counter('chat_text_stream_calls').add(1, { model });
      const result = await this.generateText(messages, model, options);

      for await (const content of result) {
        if (content) {
          yield content;
          if (options.signal?.aborted) {
            break;
          }
        }
      }
    } catch (e) {
      metrics.ai.counter('chat_text_stream_errors').add(1, { model });
      throw e;
    }
  }

  private async buildResponse(
    messages: PromptMessage[],
    model: string = this.availableModels[0],
    options: CopilotImageOptions = {}
  ) {
    // by default, image prompt assumes there is only one message
    const prompt = this.extractPrompt(messages.pop(), options);
    if (model.startsWith('workflows/')) {
      const stream = await falStream(model, { input: prompt });
      return this.parseSchema(FalStreamOutputSchema, await stream.done())
        .output;
    } else {
      const response = await fetch(`https://fal.run/fal-ai/${model}`, {
        method: 'POST',
        headers: {
          Authorization: `key ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...prompt,
          sync_mode: true,
          seed: options.seed || 42,
          enable_safety_checks: false,
        }),
        signal: options.signal,
      });
      return this.parseSchema(FalResponseSchema, await response.json());
    }
  }

  // ====== image to image ======
  async generateImages(
    messages: PromptMessage[],
    model: string = this.availableModels[0],
    options: CopilotImageOptions = {}
  ): Promise<Array<string>> {
    if (!this.availableModels.includes(model)) {
      throw new CopilotPromptInvalid(`Invalid model: ${model}`);
    }

    try {
      metrics.ai.counter('generate_images_calls').add(1, { model });

      const data = await this.buildResponse(messages, model, options);

      if (!data.images?.length && !data.image?.url) {
        throw this.extractFalError(data, 'Failed to generate images');
      }

      if (data.image?.url) {
        return [data.image.url];
      }

      return (
        data.images
          ?.filter((image): image is NonNullable<FalImage> => !!image)
          .map(image => image.url) || []
      );
    } catch (e: any) {
      metrics.ai.counter('generate_images_errors').add(1, { model });
      throw this.handleError(e);
    }
  }

  async *generateImagesStream(
    messages: PromptMessage[],
    model: string = this.availableModels[0],
    options: CopilotImageOptions = {}
  ): AsyncIterable<string> {
    try {
      metrics.ai.counter('generate_images_stream_calls').add(1, { model });
      const ret = await this.generateImages(messages, model, options);
      for (const url of ret) {
        yield url;
      }
    } catch (e) {
      metrics.ai.counter('generate_images_stream_errors').add(1, { model });
      throw e;
    }
  }
}
