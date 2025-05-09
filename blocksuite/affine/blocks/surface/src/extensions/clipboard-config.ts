import { type Container, createIdentifier } from '@blocksuite/global/di';
import { BlockSuiteError } from '@blocksuite/global/exceptions';
import { type BlockStdScope, StdIdentifier } from '@blocksuite/std';
import { type BlockSnapshot, Extension, type Store } from '@blocksuite/store';

import { getSurfaceComponent } from '../utils/get-surface-block';
import { EdgelessCRUDIdentifier } from './crud-extension';

export type ClipboardConfigCreationContext = {
  /**
   * element old id to new id
   */
  oldToNewIdMap: Map<string, string>;
  /**
   * element old id to new layer index
   */
  originalIndexes: Map<string, string>;

  /**
   * frame old id to new presentation index
   */
  newPresentationIndexes: Map<string, string>;
};

export const EdgelessClipboardConfigIdentifier =
  createIdentifier<EdgelessClipboardConfig>('edgeless-clipboard-config');

export abstract class EdgelessClipboardConfig extends Extension {
  static key: string;

  constructor(readonly std: BlockStdScope) {
    super();
  }

  get surface() {
    return getSurfaceComponent(this.std);
  }

  get crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  onBlockSnapshotPaste = async (
    snapshot: BlockSnapshot,
    doc: Store,
    parent?: string,
    index?: number
  ) => {
    const block = await this.std.clipboard.pasteBlockSnapshot(
      snapshot,
      doc,
      parent,
      index
    );
    return block?.id ?? null;
  };

  abstract createBlock(
    snapshot: BlockSnapshot,
    context: ClipboardConfigCreationContext
  ): string | null | Promise<string | null>;

  static override setup(di: Container) {
    if (!this.key) {
      throw new BlockSuiteError(
        BlockSuiteError.ErrorCode.ValueNotExists,
        'Key is not defined in the EdgelessClipboardConfig'
      );
    }

    di.add(
      this as unknown as { new (std: BlockStdScope): EdgelessClipboardConfig },
      [StdIdentifier]
    );

    di.addImpl(EdgelessClipboardConfigIdentifier(this.key), provider =>
      provider.get(this)
    );
  }
}
