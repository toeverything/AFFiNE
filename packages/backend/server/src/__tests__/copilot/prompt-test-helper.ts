import type { LlmRequest } from '../../native';
import type { PromptMessage } from '../../plugins/copilot/providers/types';

function createPromptMessage(
  role: PromptMessage['role'],
  content: string,
  extra: Omit<PromptMessage, 'role' | 'content'> = {}
): PromptMessage {
  return {
    role,
    content,
    ...extra,
  };
}

export function userPrompt(
  content: string,
  extra: Omit<PromptMessage, 'role' | 'content'> = {}
): PromptMessage {
  return createPromptMessage('user', content, extra);
}

export function assistantPrompt(
  content: string,
  extra: Omit<PromptMessage, 'role' | 'content'> = {}
): PromptMessage {
  return createPromptMessage('assistant', content, extra);
}

export function systemPrompt(
  content: string,
  extra: Omit<PromptMessage, 'role' | 'content'> = {}
): PromptMessage {
  return createPromptMessage('system', content, extra);
}

export function promptMessages(...messages: PromptMessage[]) {
  return messages;
}

export function singleUserPromptMessages(
  content: string,
  extra: Omit<PromptMessage, 'role' | 'content'> = {}
) {
  return promptMessages(userPrompt(content, extra));
}

export function jsonOnlyPromptMessages(userContent: string) {
  return promptMessages(
    systemPrompt('Return JSON only.'),
    userPrompt(userContent)
  );
}

type NativeTextMessage = LlmRequest['messages'][number];

export function nativeUserText(text: string): NativeTextMessage {
  return {
    role: 'user',
    content: [{ type: 'text', text }],
  };
}

export function nativeAssistantText(text: string): NativeTextMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
  };
}

export function nativeMessages(...messages: NativeTextMessage[]) {
  return messages;
}
