import assert from 'node:assert';

import {
  config as falConfig,
  stream as falStream,
} from '@fal-ai/serverless-client';
import { Logger } from '@nestjs/common';
import { z } from 'zod';

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
    seed: z.number().optional(),
    content_type: z.string(),
    file_name: z.string().optional(),
    file_size: z.number().optional(),
    width: z.number(),
    height: z.number(),
  })
  .optional();

type FalImage = z.infer<typeof FalImageSchema>;

const FalResponseSchema = z.object({
  detail: z
    .union([z.array(z.object({ msg: z.string() })), z.string()])
    .optional(),
  images: z.array(FalImageSchema).optional(),
  image: FalImageSchema.optional(),
  output: z.string().optional(),
});

type FalResponse = z.infer<typeof FalResponseSchema>;

const FalStreamOutputSchema = z.object({
  type: z.literal('output'),
  output: FalResponseSchema,
});

type FalPrompt = {
  image_url?: string;
  prompt?: string;
  lora?: string[];
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
    'workflows/darkskygit/animie',
    'workflows/darkskygit/clay',
    'workflows/darkskygit/pixel-art',
    'workflows/darkskygit/sketch',
    // image to text
    'llava-next',
  ];

  private readonly logger = new Logger(FalProvider.name);

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

  private extractError(resp: FalResponse): string {
    return Array.isArray(resp.detail)
      ? resp.detail[0]?.msg
      : typeof resp.detail === 'string'
        ? resp.detail
        : '';
  }

  private extractPrompt(message?: PromptMessage): FalPrompt {
    if (!message) throw new Error('Prompt is empty');
    const { content, attachments, params } = message;
    // prompt attachments require at least one
    if (!content && (!Array.isArray(attachments) || !attachments.length)) {
      throw new Error('Prompt or Attachments is empty');
    }
    if (Array.isArray(attachments) && attachments.length > 1) {
      throw new Error('Only one attachment is allowed');
    }
    const lora = (
      params?.lora
        ? Array.isArray(params.lora)
          ? params.lora
          : [params.lora]
        : []
    ).filter(v => typeof v === 'string' && v.length);
    return {
      image_url: attachments?.[0],
      prompt: content.trim(),
      lora: lora.length ? lora : undefined,
    };
  }

  async generateText(
    messages: PromptMessage[],
    model: string = 'llava-next',
    options: CopilotChatOptions = {}
  ): Promise<string> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model: ${model}`);
    }

    // by default, image prompt assumes there is only one message
    const prompt = this.extractPrompt(messages.pop());
    const data = (await fetch(`https://fal.run/fal-ai/${model}`, {
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
    }).then(res => res.json())) as FalResponse;

    if (!data.output) {
      const error = this.extractError(data);
      throw new Error(
        error ? `Failed to generate image: ${error}` : 'No images generated'
      );
    }
    return data.output;
  }

  async *generateTextStream(
    messages: PromptMessage[],
    model: string = 'llava-next',
    options: CopilotChatOptions = {}
  ): AsyncIterable<string> {
    const result = await this.generateText(messages, model, options);

    for await (const content of result) {
      if (content) {
        yield content;
        if (options.signal?.aborted) {
          break;
        }
      }
    }
  }

  private async buildResponse(
    messages: PromptMessage[],
    model: string = this.availableModels[0],
    options: CopilotImageOptions = {}
  ) {
    // by default, image prompt assumes there is only one message
    const prompt = this.extractPrompt(messages.pop());
    if (model.startsWith('workflows/')) {
      const stream = await falStream(model, { input: prompt });

      const result = FalStreamOutputSchema.safeParse(await stream.done());
      if (result.success) return result.data.output;
      const errors = JSON.stringify(result.error.errors);
      throw new Error(`Unexpected fal response: ${errors}`);
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
      const result = FalResponseSchema.safeParse(await response.json());
      if (result.success) return result.data;
      const errors = JSON.stringify(result.error.errors);
      throw new Error(`Unexpected fal response: ${errors}`);
    }
  }

  // ====== image to image ======
  async generateImages(
    messages: PromptMessage[],
    model: string = this.availableModels[0],
    options: CopilotImageOptions = {}
  ): Promise<Array<string>> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model: ${model}`);
    }

    try {
      const data = await this.buildResponse(messages, model, options);

      if (!data.images?.length && !data.image?.url) {
        const error = this.extractError(data);
        const finalError = error
          ? `Failed to generate image: ${error}`
          : 'No images generated';
        this.logger.error(finalError);
        throw new Error(finalError);
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
      const error = `Failed to generate image: ${e.message}`;
      this.logger.error(error, e.stack);
      throw new Error(error);
    }
  }

  async *generateImagesStream(
    messages: PromptMessage[],
    model: string = this.availableModels[0],
    options: CopilotImageOptions = {}
  ): AsyncIterable<string> {
    const ret = await this.generateImages(messages, model, options);
    for (const url of ret) {
      yield url;
    }
  }
}
