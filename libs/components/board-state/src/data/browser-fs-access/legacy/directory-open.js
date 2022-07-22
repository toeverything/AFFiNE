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
 * Opens a directory from disk using the legacy
 * `<input type="file" webkitdirectory>` method.
 * @type { typeof import("../../index").directoryOpen }
 */
export default async (options = [{}]) => {
    if (!Array.isArray(options)) {
        options = [options];
    }
    options[0].recursive = options[0].recursive || false;
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;

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
            let files = Array.from(input.files);
            if (!options[0].recursive) {
                files = files.filter(file => {
                    return file.webkitRelativePath.split('/').length === 2;
                });
            } else if (options[0].recursive && options[0].skipDirectory) {
                files = files.filter(file => {
                    const directoriesName = file.webkitRelativePath.split('/');
                    return directoriesName.every(
                        directoryName =>
                            !options[0].skipDirectory({
                                name: directoryName,
                                kind: 'directory',
                            })
                    );
                });
            }

            _resolve(files);
        });

        input.click();
    });
};
