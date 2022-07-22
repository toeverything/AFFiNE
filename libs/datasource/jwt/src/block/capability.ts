import { BlockSearchItem } from './index';

export class BlockCapability {
    // Accept a block instance, check its type, content data structure
    // Does it meet the structural requirements of the current capability
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected check_block(block: BlockSearchItem): boolean {
        return true;
    }

    // data structure upgrade
    protected migration(): void {
        // TODO: need to override
    }
}
