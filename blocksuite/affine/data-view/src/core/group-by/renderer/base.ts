import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { property } from 'lit/decorators.js';

import type { GroupRenderProps } from '../types.js';

export class BaseGroup<Data extends NonNullable<unknown>, Value>
  extends SignalWatcher(WithDisposable(ShadowlessElement))
  implements GroupRenderProps<Data, Value>
{
  @property({ attribute: false })
  accessor data!: Data;

  @property({ attribute: false })
  accessor readonly!: boolean;

  @property({ attribute: false })
  accessor updateData: ((data: Data) => void) | undefined = undefined;

  @property({ attribute: false })
  accessor updateValue: ((value: Value) => void) | undefined = undefined;

  @property({ attribute: false })
  accessor value!: Value;
}
