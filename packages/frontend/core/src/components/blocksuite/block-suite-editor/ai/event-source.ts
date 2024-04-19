import { GeneralNetworkError } from '@blocksuite/blocks';

export function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type AffineTextEvent = {
  type: 'attachment' | 'message';
  data: string;
};

type AffineTextStream = AsyncIterable<AffineTextEvent>;

type toTextStreamOptions = {
  timeout?: number;
};

export function toTextStream(
  eventSource: EventSource,
  { timeout }: toTextStreamOptions = {}
): AffineTextStream {
  return {
    [Symbol.asyncIterator]: async function* () {
      const messageQueue: AffineTextEvent[] = [];
      let resolveMessagePromise: () => void;
      let rejectMessagePromise: (err: Error) => void;

      function resetMessagePromise() {
        if (resolveMessagePromise) {
          resolveMessagePromise();
        }
        return new Promise<void>((resolve, reject) => {
          resolveMessagePromise = resolve;
          rejectMessagePromise = reject;
        });
      }
      let messagePromise = resetMessagePromise();

      function messageListener(event: MessageEvent) {
        messageQueue.push({
          type: event.type as 'attachment' | 'message',
          data: event.data as string,
        });
        messagePromise = resetMessagePromise();
      }

      eventSource.addEventListener('message', messageListener);
      eventSource.addEventListener('attachment', messageListener);

      eventSource.addEventListener('error', event => {
        const errorMessage = (event as unknown as { data: string }).data;
        // if there is data in Error event, it means the server sent an error message
        // otherwise, the stream is finished successfully
        if (event.type === 'error' && errorMessage) {
          rejectMessagePromise(new GeneralNetworkError(errorMessage));
        } else {
          resolveMessagePromise();
        }
        eventSource.close();
      });

      try {
        while (eventSource.readyState !== EventSource.CLOSED) {
          if (messageQueue.length === 0) {
            // Wait for the next message or timeout
            await (timeout
              ? Promise.race([
                  messagePromise,
                  delay(timeout).then(() => {
                    throw new Error('Timeout');
                  }),
                ])
              : messagePromise);
          } else if (messageQueue.length > 0) {
            const top = messageQueue.shift();
            if (top) {
              yield top;
            }
          }
        }
      } finally {
        eventSource.close();
      }
    },
  };
}
