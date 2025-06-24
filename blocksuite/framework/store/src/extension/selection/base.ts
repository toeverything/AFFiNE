import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';

import type { SelectionConstructor } from './types';

export type BaseSelectionOptions = {
  blockId: string;
};

export abstract class BaseSelection {
  static readonly group: string;

  static readonly type: string;

  static readonly recoverable: boolean = false;

  readonly blockId: string;

  get group(): string {
    return (this.constructor as SelectionConstructor).group;
  }

  get type(): string {
    return (this.constructor as SelectionConstructor).type as string;
  }

  constructor({ blockId }: BaseSelectionOptions) {
    this.blockId = blockId;
  }

  static fromJSON(_: Record<string, unknown>): BaseSelection {
    throw new BlockSuiteError(
      ErrorCode.SelectionError,
      'You must override this method'
    );
  }

  abstract equals(other: BaseSelection): boolean;

  is<T extends SelectionConstructor>(
    type: T
  ): this is T extends SelectionConstructor<infer U> ? U : never {
    return this.type === type.type;
  }

  abstract toJSON(): Record<string, unknown>;
}
