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
 * Opens a file from disk using the legacy `<input type="file">` method.
 * @type { typeof import("../../index").fileOpen }
 */
export default async (options = [{}]) => {
    if (!Array.isArray(options)) {
        options = [options];
    }
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        const accept = [
            ...options.map(option => option.mimeTypes || []).join(),
            options.map(option => option.extensions || []).join(),
        ].join();
        input.multiple = options[0].multiple || false;
        // Empty string allows everything.
        input.accept = accept || '';
        const _reject = () => cleanupListenersAndMaybeReject(reject);
        const _resolve = value => {
            if (typeof cleanupListenersAndMaybeReject === 'function') {
                cleanupListenersAndMaybeReject();
            }
            resolve(value);
        };
        // ToDo: Remove this workaround once
        // https://github.com/whatwg/html/issues/6376 is specified and supported.
        const cleanupListenersAndMaybeReject =
            options[0].legacySetup &&
            options[0].legacySetup(_resolve, _reject, input);
        input.addEventListener('change', () => {
            _resolve(input.multiple ? Array.from(input.files) : input.files[0]);
        });

        input.click();
    });
};
