/* eslint-disable */
/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
// @license © 2020 Google LLC. Licensed under the Apache License, Version 2.0.

/**
 * Saves a file to disk using the legacy `<a download>` method.
 * @type { typeof import("../../index").fileSave }
 */
export default async (blobOrResponse, options = {}) => {
    if (Array.isArray(options)) {
        options = options[0];
    }
    const a = document.createElement('a');
    let data = blobOrResponse;
    // Handle the case where input is a `ReadableStream`.
    if ('body' in blobOrResponse) {
        data = await streamToBlob(
            blobOrResponse.body,
            blobOrResponse.headers.get('content-type')
        );
    }
    a.download = options.fileName || 'Untitled';
    a.href = URL.createObjectURL(data);

    const _reject = () => cleanupListenersAndMaybeReject(reject);
    const _resolve = () => {
        if (typeof cleanupListenersAndMaybeReject === 'function') {
            cleanupListenersAndMaybeReject();
        }
    };
    // ToDo: Remove this workaround once
    // https://github.com/whatwg/html/issues/6376 is specified and supported.
    const cleanupListenersAndMaybeReject =
        options.legacySetup && options.legacySetup(_resolve, _reject, a);

    a.addEventListener('click', () => {
        // `setTimeout()` due to
        // https://github.com/LLK/scratch-gui/issues/1783#issuecomment-426286393
        setTimeout(() => URL.revokeObjectURL(a.href), 30 * 1000);
        _resolve(null);
    });
    a.click();
    return null;
};

/**
 * Converts a passed `ReadableStream` to a `Blob`.
 * @param {ReadableStream} stream
 * @param {string} type
 * @returns {Promise<Blob>}
 */
async function streamToBlob(stream, type) {
    const reader = stream.getReader();
    const pumpedStream = new ReadableStream({
        start(controller) {
            return pump();
            /**
             * Recursively pumps data chunks out of the `ReadableStream`.
             * @type { () => Promise<void> }
             */
            async function pump() {
                return reader.read().then(({ done, value }) => {
                    if (done) {
                        controller.close();
                        return;
                    }
                    controller.enqueue(value);
                    return pump();
                });
            }
        },
    });

    const res = new Response(pumpedStream);
    reader.releaseLock();
    return new Blob([await res.blob()], { type });
}
