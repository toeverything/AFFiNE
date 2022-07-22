import { Map as YMap } from 'yjs';

export class GateKeeper {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    #user_id: string;
    #creators: YMap<string>;
    #common: YMap<string>;

    constructor(userId: string, creators: YMap<string>, common: YMap<string>) {
        this.#user_id = userId;
        this.#creators = creators;
        this.#common = common;
    }

    getCreator(block_id: string): string | undefined {
        return this.#creators.get(block_id) || this.#common.get(block_id);
    }

    setCreator(block_id: string) {
        if (!this.#creators.get(block_id)) {
            this.#creators.set(block_id, this.#user_id);
        }
    }

    setCommon(block_id: string) {
        if (!this.#creators.get(block_id) && !this.#common.get(block_id)) {
            this.#common.set(block_id, this.#user_id);
        }
    }

    private check_delete(block_id: string): boolean {
        const creator = this.#creators.get(block_id);
        return creator === this.#user_id || !!this.#common.get(block_id);
    }

    checkDeleteLists(block_ids: string[]) {
        const success = [];
        const fail = [];
        for (const block_id of block_ids) {
            if (this.check_delete(block_id)) {
                success.push(block_id);
            } else {
                fail.push(block_id);
            }
        }
        return [success, fail];
    }

    clear() {
        this.#creators.clear();
        this.#common.clear();
    }
}
