import { Array as YArray, Map as YMap } from 'yjs';

import { RemoteKvService } from '@toeverything/datasource/remote-kv';

export class YjsRemoteBinaries {
    readonly #binaries: YMap<YArray<ArrayBuffer>>; // binary instance
    readonly #remote_storage?: RemoteKvService;

    constructor(binaries: YMap<YArray<ArrayBuffer>>, remote_token?: string) {
        this.#binaries = binaries;
        if (remote_token) {
            this.#remote_storage = new RemoteKvService(remote_token);
        } else {
            console.warn(`Remote storage is not ready`);
        }
    }

    has(name: string): boolean {
        return this.#binaries.has(name);
    }

    async get(name: string): Promise<YArray<ArrayBuffer> | undefined> {
        if (this.#binaries.has(name)) {
            return this.#binaries.get(name);
        } else {
            // TODO: Remote Load
            try {
                const file = await this.#remote_storage?.instance.getBuffData(
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
        if (!this.#binaries.has(name)) {
            console.log(name, 'name');
            if (binary.length === 1) {
                this.#binaries.set(name, binary);
                if (this.#remote_storage) {
                    // TODO: Remote Save, if there is an object with the same name remotely, the upload is skipped, because the file name is the hash of the file content
                    const has_file = this.#remote_storage.instance.exist(name);
                    if (!has_file) {
                        const upload_file = new File(binary.toArray(), name);
                        await this.#remote_storage.instance
                            .upload(upload_file)
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
