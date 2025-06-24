import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { property } from 'lit/decorators.js';

import type { Group } from '../trait.js';
import type { GroupRenderProps } from '../types.js';

export class BaseGroup<JsonValue, Data extends Record<string, unknown>>
  extends SignalWatcher(WithDisposable(ShadowlessElement))
  implements GroupRenderProps<JsonValue, Data>
{
  @property({ attribute: false })
  accessor group!: Group<unknown, JsonValue, Data>;

  @property({ attribute: false })
  accessor readonly!: boolean;

  updateData(data: Data) {
    this.group.manager.updateData(data);
  }

  updateValue(value: JsonValue) {
    this.group.manager.updateValue(
      this.group.rows.map(row => row.rowId),
      value
    );
  }

  get value(): JsonValue {
    return this.group.value as JsonValue;
  }

  get type() {
    return this.group.tType;
  }

  get data() {
    return this.group.property.data$.value;
  }
}
