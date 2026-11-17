import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { TASK_HIERARCHY_LEVEL_COLUMN_NAME } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { css } from 'lit';
import { property, state } from 'lit/decorators.js';
import { html } from 'lit/static-html.js';

import { filterTraitKey } from '../../../core/filter/trait.js';
import { groupTraitKey } from '../../../core/group-by/trait.js';
import type { SingleView } from '../../../core/index.js';
import { canGroupable } from '../group-by-utils.js';

const styles = css`
  affine-data-view-kanban-header {
    display: flex;
    justify-content: space-between;
    padding: 4px;
  }

  .select-group {
    border-radius: 8px;
    padding: 4px 8px;
    cursor: pointer;
  }

  .select-group:hover {
    background-color: var(--affine-hover-color);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
`;

export class KanbanHeader extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  @state()
  private accessor _selectedLevel = 'All';

  private readonly clickGroup = (e: MouseEvent) => {
    const groupTrait = this.view.traitGet(groupTraitKey);
    if (!groupTrait) {
      return;
    }
    popMenu(popupTargetFromElement(e.target as HTMLElement), {
      options: {
        items: this.view.properties$.value
          .filter(column => {
            if (column.id === groupTrait.property$.value?.id) {
              return false;
            }
            return canGroupable(this.view.manager.dataSource, column.id);
          })
          .map(column => {
            return menu.action({
              name: column.name$.value,
              select: () => {
                groupTrait.changeGroup(column.id);
              },
            });
          }),
      },
    });
  };

  private readonly clickHierarchyLevel = (e: MouseEvent) => {
    const filterTrait = this.view.traitGet(filterTraitKey);
    if (!filterTrait) {
      return;
    }

    const hierarchyProperty = this.view.propertiesRaw$.value.find(
      p => p.name$.value === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );
    if (!hierarchyProperty) {
      return;
    }

    const currentFilter = filterTrait.filter$.value;
    const baseConditions = currentFilter.conditions.filter(condition => {
      if (condition.type !== 'filter') {
        return true;
      }
      return !(
        condition.left.type === 'ref' &&
        condition.left.name === hierarchyProperty.id
      );
    });

    const levels = ['All', '0', '1', '2', '3', '4', '5'];

    popMenu(popupTargetFromElement(e.target as HTMLElement), {
      options: {
        items: levels.map(level =>
          menu.action({
            name: level,
            select: () => {
              if (level === 'All') {
                this._selectedLevel = 'All';
                filterTrait.filterSet({
                  ...currentFilter,
                  conditions: baseConditions,
                });
                return;
              }

              this._selectedLevel = level;
              filterTrait.filterSet({
                ...currentFilter,
                conditions: [
                  ...baseConditions,
                  {
                    type: 'filter',
                    left: {
                      type: 'ref',
                      name: hierarchyProperty.id,
                    },
                    function: 'is',
                    args: [{ type: 'literal', value: Number(level) }],
                  },
                ],
              });
            },
          })
        ),
      },
    });
  };

  override render() {
    return html`
      <div></div>
      <div class="header-actions">
        <div class="select-group" @click="${this.clickHierarchyLevel}">
          Level: ${this._selectedLevel}
        </div>
        <div class="select-group" @click="${this.clickGroup}">Group</div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor view!: SingleView;
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-kanban-header': KanbanHeader;
  }
}
