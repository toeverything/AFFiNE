import { Map as YMap } from 'yjs';

export class GateKeeper {
    private readonly _userId: string;
    private readonly _creators: YMap<string>;
    private readonly _common: YMap<string>;

    constructor(userId: string, creators: YMap<string>, common: YMap<string>) {
        this._userId = userId;
        this._creators = creators;
        this._common = common;
    }

    getCreator(block_id: string): string | undefined {
        return this._creators.get(block_id) || this._common.get(block_id);
    }

    setCreator(block_id: string) {
        if (!this._creators.get(block_id)) {
            this._creators.set(block_id, this._userId);
        }
    }

    setCommon(block_id: string) {
        if (!this._creators.get(block_id) && !this._common.get(block_id)) {
            this._common.set(block_id, this._userId);
        }
    }

    private check_delete(block_id: string): boolean {
        const creator = this._creators.get(block_id);
        return creator === this._userId || !!this._common.get(block_id);
    }

    checkDeleteLists(block_ids: string[]): [string[], string[]] {
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
        this._creators.clear();
        this._common.clear();
    }
}
