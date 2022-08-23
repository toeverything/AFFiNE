import { ServiceBaseClass } from '../base';
import { ReturnUnobserve } from '../database/observer';
import { ObserveCallback } from './page-tree';

export class TOC extends ServiceBaseClass {
    private onActivePageChange?: () => void;

    async observe(
        { workspace, pageId }: { workspace: string; pageId: string },
        callback: ObserveCallback
    ): Promise<ReturnUnobserve> {
        // not only use observe, but also addChildrenListener is OK 🎉🎉🎉
        // const pageBlock = await this.getBlock(workspace, pageId);
        //
        // this.onActivePageChange?.();
        // pageBlock?.addChildrenListener('onPageChildrenChange', () => {
        //     callback();
        // });
        //
        // this.onActivePageChange = () => pageBlock?.removeChildrenListener('onPageChildrenChange');

        const unobserve = await this._observe(workspace, pageId, callback);

        return () => {
            unobserve();
        };
    }
}
