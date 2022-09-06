import { Array as YArray, Map as YMap } from 'yjs';

import type { RemoteKvService } from '@toeverything/datasource/remote-kv';

export class YjsRemoteBinaries {
    private readonly _binaries: YMap<YArray<ArrayBuffer>>; // binary instance
    private readonly _remoteStorage?: RemoteKvService;

    constructor(binaries: YMap<YArray<ArrayBuffer>>, remoteToken?: string) {
        this._binaries = binaries;
        if (remoteToken) {
            // TODO: remote kv need to refactor, we may use cloudflare kv
            // this._remoteStorage = new RemoteKvService(remote_token);
        } else {
            console.warn(`Remote storage is not ready`);
        }
    }

    has(name: string): boolean {
        return this._binaries.has(name);
    }

    async get(name: string): Promise<YArray<ArrayBuffer> | undefined> {
        if (this._binaries.has(name)) {
            return this._binaries.get(name);
        } else {
            // TODO: Remote Load
            try {
                const file = await this._remoteStorage?.instance?.getBuffData(
                    name
                );
                console.log(file);
                // return file;
            } catch (e) {
                throw new Error(`Binary ${name} not found`);
            }
            return undefined;
        }
    }

    async set(name: string, binary: YArray<ArrayBuffer>) {
        if (!this._binaries.has(name)) {
            console.log(name, 'name');
            if (binary.length === 1) {
                this._binaries.set(name, binary);
                if (this._remoteStorage) {
                    // TODO: Remote Save, if there is an object with the same name remotely, the upload is skipped, because the file name is the hash of the file content
                    const has_file = this._remoteStorage.instance?.exist(name);
                    if (!has_file) {
                        const upload_file = new File(binary.toArray(), name);
                        await this._remoteStorage.instance
                            ?.upload(upload_file)
                            .catch(err => {
                                throw new Error(`${err} upload error`);
                            });
                    }
                } else {
                    console.warn(`Remote storage is not ready`);
                }
                return;
            } else {
                console.log('err');
            }
            throw new Error(`Binary ${name} is invalid`);
        }
    }
}
