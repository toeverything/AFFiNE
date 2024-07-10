import { AIProvider } from '@affine/core/blocksuite/presets/ai';
import { assertExists } from '@blocksuite/global/utils';
import { partition } from 'lodash-es';

import { CopilotClient } from './copilot-client';
import { delay, toTextStream } from './event-source';
import type { PromptKey } from './prompt';

const TIMEOUT = 50000;

const client = new CopilotClient();

export type TextToTextOptions = {
  docId: string;
  workspaceId: string;
  promptName?: PromptKey;
  sessionId?: string | Promise<string>;
  content?: string;
  attachments?: (string | Blob | File)[];
  params?: Record<string, string>;
  timeout?: number;
  stream?: boolean;
  signal?: AbortSignal;
  retry?: boolean;
  workflow?: boolean;
  postfix?: (text: string) => string;
};

export type ToImageOptions = TextToTextOptions & {
  seed?: string;
};

export function createChatSession({
  workspaceId,
  docId,
}: {
  workspaceId: string;
  docId: string;
}) {
  return client.createSession({
    workspaceId,
    docId,
    promptName: 'chat:gpt4',
  });
}

async function createSessionMessage({
  docId,
  workspaceId,
  promptName,
  content,
  sessionId: providedSessionId,
  attachments,
  params,
  retry = false,
}: TextToTextOptions) {
  if (!promptName && !providedSessionId) {
    throw new Error('promptName or sessionId is required');
  }
  const hasAttachments = attachments && attachments.length > 0;
  const sessionId = await (providedSessionId ??
    client.createSession({
      workspaceId,
      docId,
      promptName: promptName as string,
    }));

  const options: Parameters<CopilotClient['createMessage']>[0] = {
    sessionId,
    content,
    params,
  };

  if (hasAttachments) {
    const [stringAttachments, blobs] = partition(
      attachments,
      attachment => typeof attachment === 'string'
    ) as [string[], (Blob | File)[]];
    options.attachments = stringAttachments;
    options.blobs = await Promise.all(
      blobs.map(async blob => {
        if (blob instanceof File) {
          return blob;
        } else {
          return new File([blob], sessionId, {
            type: blob.type,
          });
        }
      })
    );
  }
  if (retry)
    return {
      sessionId,
    };

  const messageId = await client.createMessage(options);
  return {
    messageId,
    sessionId,
  };
}

export function textToText({
  docId,
  workspaceId,
  promptName,
  content,
  attachments,
  params,
  sessionId,
  stream,
  signal,
  timeout = TIMEOUT,
  retry = false,
  workflow = false,
  postfix,
}: TextToTextOptions) {
  let _sessionId: string;
  let _messageId: string | undefined;

  if (stream) {
    return {
      [Symbol.asyncIterator]: async function* () {
        if (retry) {
          const retrySessionId =
            (await sessionId) ?? AIProvider.LAST_ACTION_SESSIONID;
          assertExists(retrySessionId, 'retry sessionId is required');
          _sessionId = retrySessionId;
          _messageId = undefined;
        } else {
          const message = await createSessionMessage({
            docId,
            workspaceId,
            promptName,
            content,
            attachments,
            params,
            sessionId,
            retry,
          });
          _sessionId = message.sessionId;
          _messageId = message.messageId;
        }

        const eventSource = client.chatTextStream(
          {
            sessionId: _sessionId,
            messageId: _messageId,
          },
          workflow ? 'workflow' : undefined
        );
        AIProvider.LAST_ACTION_SESSIONID = _sessionId;

        if (signal) {
          if (signal.aborted) {
            eventSource.close();
            return;
          }
          signal.onabort = () => {
            eventSource.close();
          };
        }
        if (postfix) {
          const messages: string[] = [];
          for await (const event of toTextStream(eventSource, {
            timeout,
            signal,
          })) {
            if (event.type === 'message') {
              messages.push(event.data);
            }
          }
          yield postfix(messages.join(''));
        } else {
          for await (const event of toTextStream(eventSource, {
            timeout,
            signal,
          })) {
            if (event.type === 'message') {
              yield event.data;
            }
          }
        }
      },
    };
  } else {
    return Promise.race([
      timeout
        ? delay(timeout).then(() => {
            throw new Error('Timeout');
          })
        : null,
      (async function () {
        if (retry) {
          const retrySessionId =
            (await sessionId) ?? AIProvider.LAST_ACTION_SESSIONID;
          assertExists(retrySessionId, 'retry sessionId is required');
          _sessionId = retrySessionId;
          _messageId = undefined;
        } else {
          const message = await createSessionMessage({
            docId,
            workspaceId,
            promptName,
            content,
            attachments,
            params,
            sessionId,
          });
          _sessionId = message.sessionId;
          _messageId = message.messageId;
        }

        AIProvider.LAST_ACTION_SESSIONID = _sessionId;
        return client.chatText({
          sessionId: _sessionId,
          messageId: _messageId,
        });
      })(),
    ]);
  }
}

export const listHistories = client.getHistories;

// Only one image is currently being processed
export function toImage({
  docId,
  workspaceId,
  promptName,
  content,
  attachments,
  params,
  seed,
  sessionId,
  signal,
  timeout = TIMEOUT,
  retry = false,
}: ToImageOptions) {
  let _sessionId: string;
  let _messageId: string | undefined;
  return {
    [Symbol.asyncIterator]: async function* () {
      if (retry) {
        const retrySessionId =
          (await sessionId) ?? AIProvider.LAST_ACTION_SESSIONID;
        assertExists(retrySessionId, 'retry sessionId is required');
        _sessionId = retrySessionId;
        _messageId = undefined;
      } else {
        const { messageId, sessionId } = await createSessionMessage({
          docId,
          workspaceId,
          promptName,
          content,
          attachments,
          params,
        });
        _sessionId = sessionId;
        _messageId = messageId;
      }

      const eventSource = client.imagesStream(_sessionId, _messageId, seed);
      AIProvider.LAST_ACTION_SESSIONID = _sessionId;

      for await (const event of toTextStream(eventSource, {
        timeout,
        signal,
      })) {
        if (event.type === 'attachment') {
          yield event.data;
        }
      }
    },
  };
}

export function cleanupSessions({
  workspaceId,
  docId,
  sessionIds,
}: {
  workspaceId: string;
  docId: string;
  sessionIds: string[];
}) {
  return client.cleanupSessions({ workspaceId, docId, sessionIds });
}
