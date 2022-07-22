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

const getFileWithHandle = async handle => {
    const file = await handle.getFile();
    file.handle = handle;
    return file;
};

/**
 * Opens a file from disk using the File System Access API.
 * @type { typeof import("../../index").fileOpen }
 */
export default async (options = [{}]) => {
    if (!Array.isArray(options)) {
        options = [options];
    }
    const types = [];
    options.forEach((option, i) => {
        types[i] = {
            description: option.description || '',
            accept: {},
        };
        if (option.mimeTypes) {
            option.mimeTypes.map(mimeType => {
                types[i].accept[mimeType] = option.extensions || [];
            });
        } else {
            types[i].accept['*/*'] = option.extensions || [];
        }
    });
    const handleOrHandles = await window.showOpenFilePicker({
        id: options[0].id,
        startIn: options[0].startIn,
        types,
        multiple: options[0].multiple || false,
        excludeAcceptAllOption: options[0].excludeAcceptAllOption || false,
    });
    const files = await Promise.all(handleOrHandles.map(getFileWithHandle));
    if (options[0].multiple) {
        return files;
    }
    return files[0];
};
