import test from 'ava';

import { readResponseBufferWithLimit } from '../../base';

test('readResponseBufferWithLimit rejects timed out web streams without crashing', async t => {
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        queueMicrotask(() => {
          controller.error(
            new DOMException(
              'The operation was aborted due to timeout',
              'TimeoutError'
            )
          );
        });
      },
    })
  );

  const error = await t.throwsAsync(
    readResponseBufferWithLimit(response, 1024)
  );

  t.is(error?.name, 'TimeoutError');
});
