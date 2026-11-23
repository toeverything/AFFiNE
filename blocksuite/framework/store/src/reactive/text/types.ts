import type * as Y from 'yjs';

import type { BaseTextAttributes } from './attributes';

export interface OptionalAttributes {
  attributes?: Record<string, any>;
}

export type DeltaOperation = {
  insert?: string;
  delete?: number;
  retain?: number;
} & OptionalAttributes;

export type OnTextChange = (data: Y.Text, isLocal: boolean) => void;

export type DeltaInsert<
  TextAttributes extends BaseTextAttributes = BaseTextAttributes,
> = {
  insert: string;
  attributes?: TextAttributes;
};
