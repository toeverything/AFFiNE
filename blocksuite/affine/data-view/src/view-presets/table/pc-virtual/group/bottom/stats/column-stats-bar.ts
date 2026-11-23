import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type { Group } from '../../../../../../core/group-by/trait';
import { LEFT_TOOL_BAR_WIDTH, STATS_BAR_HEIGHT } from '../../../../consts';
import type { TableSingleView } from '../../../../table-view-manager';

const styles = css`
  affine-database-virtual-column-stats {
    margin-left: ${LEFT_TOOL_BAR_WIDTH}px;
    height: ${STATS_BAR_HEIGHT}px;
    display: flex;
  }
`;

export class VirtualDataBaseColumnStats extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  protected override render() {
    const cols = this.view.properties$.value;
    return html`
      ${repeat(
        cols,
        col => col.id,
        col => {
          return html`<affine-database-virtual-column-stats-cell
            .column=${col}
            .group=${this.group}
          ></affine-database-virtual-column-stats-cell>`;
        }
      )}
    `;
  }

  @property({ attribute: false })
  accessor group: Group | undefined = undefined;

  @property({ attribute: false })
  accessor view!: TableSingleView;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-virtual-column-stats': VirtualDataBaseColumnStats;
  }
}
