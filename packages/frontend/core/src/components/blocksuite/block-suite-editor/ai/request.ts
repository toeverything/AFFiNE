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
}: TextToTextOptions) {
  if (stream) {
    return {
      [Symbol.asyncIterator]: async function* () {
        const message = await createSessionMessage({
          docId,
          workspaceId,
          promptName,
          content,
          attachments,
          params,
          sessionId,
        });
        const eventSource = client.chatTextStream({
          sessionId: message.sessionId,
          messageId: message.messageId,
        });
        if (signal) {
          if (signal.aborted) {
            eventSource.close();
            return;
          }
          signal.onabort = () => {
            eventSource.close();
          };
        }
        for await (const event of toTextStream(eventSource, {
          timeout,
          signal,
        })) {
          if (event.type === 'message') {
            yield event.data;
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
      createSessionMessage({
        docId,
        workspaceId,
        promptName,
        content,
        attachments,
        params,
        sessionId,
      }).then(message => {
        return client.chatText({
          sessionId: message.sessionId,
          messageId: message.messageId,
        });
      }),
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
  signal,
  timeout = TIMEOUT,
}: ToImageOptions) {
  return {
    [Symbol.asyncIterator]: async function* () {
      const { messageId, sessionId } = await createSessionMessage({
        docId,
        workspaceId,
        promptName,
        content,
        attachments,
        params,
      });

      const eventSource = client.imagesStream(messageId, sessionId, seed);
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
