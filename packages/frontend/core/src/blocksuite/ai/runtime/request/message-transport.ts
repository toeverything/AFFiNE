import type { AIToolsConfig } from '@affine/core/modules/ai-button';
import { partition } from 'lodash-es';

import { toTextStream } from '../../provider/event-source';
import { createWorkspaceByokLocalLease } from './byok-local-lease';
import { type CopilotClient, Endpoint } from './copilot-client';

const TIMEOUT = 50000;

export type TextToTextOptions = {
  client: CopilotClient;
  sessionId: string;
  workspaceId?: string;
  content?: string;
  attachments?: (string | Blob | File)[];
  params?: Record<string, unknown>;
  timeout?: number;
  stream?: boolean;
  signal?: AbortSignal;
  retry?: boolean;
  endpoint?: Endpoint;
  actionId?: string;
  actionVersion?: string;
  runId?: string;
  isRootSession?: boolean;
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
  params?: Record<string, unknown>;
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
    params: params as Parameters<CopilotClient['createMessage']>[0]['params'],
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
  workspaceId,
  content,
  attachments,
  params,
  stream,
  signal,
  timeout = TIMEOUT,
  retry = false,
  endpoint = Endpoint.StreamObject,
  actionId,
  actionVersion,
  runId,
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
        if (signal?.aborted) {
          return;
        }
        const byokLeaseId = await createWorkspaceByokLocalLease(
          client,
          workspaceId
        );
        if (signal?.aborted) {
          return;
        }
        const eventSource = client.chatTextStream(
          {
            sessionId,
            messageId,
            reasoning,
            modelId,
            toolsConfig,
            actionId,
            actionVersion,
            runId,
            retry,
            byokLeaseId,
          },
          endpoint
        );

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

          for await (const event of toTextStream(eventSource, {
            timeout,
            signal,
          })) {
            if (event.type === 'message') {
              yield event.data;
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
      if (signal?.aborted) {
        return '';
      }
      const byokLeaseId = await createWorkspaceByokLocalLease(
        client,
        workspaceId
      );
      if (signal?.aborted) {
        return '';
      }
      const eventSource = client.chatTextStream(
        {
          sessionId,
          messageId,
          reasoning,
          modelId,
          toolsConfig,
          actionId,
          actionVersion,
          runId,
          retry,
          byokLeaseId,
        },
        endpoint
      );

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

        return messages.join('');
      } finally {
        eventSource.close();
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
      }
    })();
  }
}

export function toImage({
  content,
  sessionId,
  workspaceId,
  attachments,
  params,
  seed,
  signal,
  timeout = TIMEOUT,
  retry = false,
  endpoint,
  actionId,
  actionVersion,
  runId,
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
      if (signal?.aborted) {
        return;
      }
      const byokLeaseId = await createWorkspaceByokLocalLease(
        client,
        workspaceId
      );
      if (signal?.aborted) {
        return;
      }
      const eventSource =
        endpoint === Endpoint.Action
          ? client.chatTextStream(
              {
                sessionId,
                messageId,
                actionId,
                actionVersion,
                runId,
                retry,
                byokLeaseId,
              },
              Endpoint.Action
            )
          : client.imagesStream(
              sessionId,
              messageId,
              seed,
              endpoint,
              byokLeaseId
            );

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
