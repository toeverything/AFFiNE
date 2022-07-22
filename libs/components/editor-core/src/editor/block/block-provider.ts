import type { AsyncBlock } from './async-block';
import { BaseView as BlockView } from './../views/base-view';

interface BlockProviderCtorProps {
    blockView: BlockView;
    block: AsyncBlock;
}

export class BlockProvider {
    private block: AsyncBlock;
    private block_view: BlockView;
    constructor(props: BlockProviderCtorProps) {
        this.block = props.block;
        this.block_view = props.blockView;
    }

    isEmpty() {
        return this.block_view.isEmpty(this.block);
    }
}
