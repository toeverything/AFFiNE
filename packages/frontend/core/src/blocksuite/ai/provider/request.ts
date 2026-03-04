import type { AIToolsConfig } from '@affine/core/modules/ai-button';
import { partition } from 'lodash-es';

import { AIProvider } from './ai-provider';
import { type CopilotClient, Endpoint } from './copilot-client';
import { toTextStream } from './event-source';

const TIMEOUT = 50000;

export type TextToTextOptions = {
  client: CopilotClient;
  sessionId: string;
  content?: string;
  attachments?: (string | Blob | File)[];
  params?: Record<string, any>;
  timeout?: number;
  stream?: boolean;
  signal?: AbortSignal;
  retry?: boolean;
  endpoint?: Endpoint;
  isRootSession?: boolean;
  postfix?: (text: string) => string;
  reasoning?: boolean;
  modelId?: string;
  toolsConfig?: AIToolsConfig;
};

export type ToImageOptions = TextToTextOptions & {
  seed?: string;
};

async function resizeImage(blob: Blob | File): Promise<Blob | null> {
  let src = '';
  try {
    src = URL.createObjectURL(blob);
    const img = new Image();
    img.src = src;
    await new Promise(resolve => {
      img.onload = resolve;
    });

    const canvas = document.createElement('canvas');
    // keep aspect ratio
    const scale = Math.min(1024 / img.width, 1024 / img.height);
    canvas.width = Math.floor(img.width * scale);
    canvas.height = Math.floor(img.height * scale);

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      return await new Promise(resolve =>
        canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.8)
      );
    }
  } catch (e) {
    console.error(e);
  } finally {
    if (src) URL.revokeObjectURL(src);
  }
  return null;
}

interface CreateMessageOptions {
  client: CopilotClient;
  sessionId: string;
  content?: string;
  attachments?: (string | Blob | File)[];
  params?: Record<string, any>;
  timeout?: number;
  signal?: AbortSignal;
}

async function createMessage({
  client,
  sessionId,
  content,
  attachments,
  params,
  timeout,
  signal,
}: CreateMessageOptions): Promise<string> {
  const hasAttachments = attachments && attachments.length > 0;
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
    options.blobs = (
      await Promise.all(
        blobs.map(resizeImage).map(async blob => {
          const file = await blob;
          if (!file) return null;
          return new File([file], sessionId, {
            type: file.type,
          });
        })
      )
    ).filter(Boolean) as File[];
  }

  return await client.createMessage(options, { timeout, signal });
}

export function textToText({
  client,
  sessionId,
  content,
  attachments,
  params,
  stream,
  signal,
  timeout = TIMEOUT,
  retry = false,
  endpoint = Endpoint.StreamObject,
  postfix,
  reasoning,
  modelId,
  toolsConfig,
}: TextToTextOptions) {
  let messageId: string | undefined;

  if (stream) {
    return {
      [Symbol.asyncIterator]: async function* () {
        if (!retry) {
          messageId = await createMessage({
            client,
            sessionId,
            content,
            attachments,
            params,
            timeout,
            signal,
          });
        }
        const eventSource = client.chatTextStream(
          {
            sessionId,
            messageId,
            reasoning,
            modelId,
            toolsConfig,
          },
          endpoint
        );
        AIProvider.LAST_ACTION_SESSIONID = sessionId;

        let onAbort: (() => void) | undefined;
        try {
          if (signal) {
            if (signal.aborted) {
              eventSource.close();
              return;
            }
            onAbort = () => {
              eventSource.close();
            };
            signal.addEventListener('abort', onAbort, { once: true });
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
        } finally {
          eventSource.close();
          if (signal && onAbort) {
            signal.removeEventListener('abort', onAbort);
          }
        }
      },
    };
  } else {
    return (async function () {
      if (!retry) {
        messageId = await createMessage({
          client,
          sessionId,
          content,
          attachments,
          params,
          timeout,
          signal,
        });
      }
      const eventSource = client.chatTextStream(
        {
          sessionId,
          messageId,
          reasoning,
          modelId,
          toolsConfig,
        },
        endpoint
      );
      AIProvider.LAST_ACTION_SESSIONID = sessionId;

      let onAbort: (() => void) | undefined;
      try {
        if (signal) {
          if (signal.aborted) {
            eventSource.close();
            return '';
          }
          onAbort = () => {
            eventSource.close();
          };
          signal.addEventListener('abort', onAbort, { once: true });
        }

        const messages: string[] = [];
        for await (const event of toTextStream(eventSource, {
          timeout,
          signal,
        })) {
          if (event.type === 'message') {
            messages.push(event.data);
          }
        }

        const result = messages.join('');
        return postfix ? postfix(result) : result;
      } finally {
        eventSource.close();
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
      }
    })();
  }
}

// Only one image is currently being processed
export function toImage({
  content,
  sessionId,
  attachments,
  params,
  seed,
  signal,
  timeout = TIMEOUT,
  retry = false,
  endpoint,
  client,
}: ToImageOptions) {
  let messageId: string | undefined;
  return {
    [Symbol.asyncIterator]: async function* () {
      if (!retry) {
        messageId = await createMessage({
          client,
          sessionId,
          content,
          attachments,
          params,
          timeout,
          signal,
        });
      }
      const eventSource = client.imagesStream(
        sessionId,
        messageId,
        seed,
        endpoint
      );
      AIProvider.LAST_ACTION_SESSIONID = sessionId;

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
