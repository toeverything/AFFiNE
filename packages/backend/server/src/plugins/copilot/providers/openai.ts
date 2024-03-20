import assert from 'node:assert';

import { ClientOptions, OpenAI } from 'openai';

import {
  ChatMessage,
  CopilotProviderCapability,
  CopilotProviderType,
  CopilotTextToTextProvider,
} from '../types';

export class OpenAIProvider
  extends OpenAI
  implements CopilotTextToTextProvider
{
  static readonly type = CopilotProviderType.OpenAI;
  static readonly capabilities = [
    CopilotProviderCapability.TextToText,
    CopilotProviderCapability.TextToEmbedding,
    CopilotProviderCapability.TextToImage,
  ];

  readonly availableModels = ['gpt-3.5-turbo'];

  constructor(config: ClientOptions) {
    assert(OpenAIProvider.assetsConfig(config));
    super(config);
  }

  static assetsConfig(config: ClientOptions) {
    return !!config.apiKey;
  }

  getCapabilities(): CopilotProviderCapability[] {
    return OpenAIProvider.capabilities;
  }

  private chatToGPTMessage(messages: ChatMessage[]) {
    // filter redundant fields
    return messages.map(message => ({
      role: message.role,
      content: message.content,
    }));
  }

  async generateText(
    messages: ChatMessage[],
    model: string = 'gpt-3.5-turbo'
  ): Promise<string> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model: ${model}`);
    }
    const result = await this.chat.completions.create({
      messages: this.chatToGPTMessage(messages),
      model: model,
      temperature: 0,
      max_tokens: 4096,
    });
    const { content } = result.choices[0].message;
    if (!content) {
      throw new Error('Failed to generate text');
    }
    return content;
  }

  async *generateTextStream(
    messages: ChatMessage[],
    model: string
  ): AsyncIterable<string> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Invalid model: ${model}`);
    }
    const result = await this.chat.completions.create({
      stream: true,
      messages: this.chatToGPTMessage(messages),
      model: model,
      temperature: 0,
      max_tokens: 4096,
    });

    for await (const message of result) {
      const content = message.choices[0].delta.content;
      if (content) {
        yield content;
      }
    }
  }
}
