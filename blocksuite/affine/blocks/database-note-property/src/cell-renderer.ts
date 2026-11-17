import {
  type DatabaseBlockDataSource,
  EditorHostKey,
  notePropertyModelConfig,
  type NoteRefValue,
} from '@blocksuite/affine-block-database';
import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import {
  BaseCellRenderer,
  createFromBaseCellRenderer,
  createIcon,
} from '@blocksuite/data-view';
import { PageIcon, PlusIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';

import {
  attachExistingNoteForRow,
  createNoteForRow,
  revealOrInsertNoteForRow,
} from './actions.js';

const CELL_STYLE =
  'display: flex; align-items: center; justify-content: center; cursor: pointer;';

export class NoteCell extends BaseCellRenderer<NoteRefValue, NoteRefValue> {
  private readonly _openCreateOrAttachMenu = (e: MouseEvent) => {
    e.stopPropagation();
    const std = this.std;
    if (!std) return;

    popMenu(popupTargetFromElement(e.currentTarget as HTMLElement), {
      options: {
        items: [
          menu.action({
            name: 'New note',
            prefix: PageIcon(),
            select: () => {
              createNoteForRow(std, this.dataSource, this.rowId);
            },
          }),
          menu.action({
            name: 'Link existing note',
            prefix: PageIcon(),
            select: () => {
              attachExistingNoteForRow(std, this.dataSource, this.rowId).catch(
                console.error
              );
            },
          }),
        ],
      },
    });
  };

  private readonly _revealOrInsert = (e: MouseEvent) => {
    e.stopPropagation();
    const std = this.std;
    if (!std) return;
    revealOrInsertNoteForRow(std, this.dataSource, this.rowId);
  };

  get std() {
    const host = this.view.serviceGet(EditorHostKey);
    return host?.std;
  }

  get dataSource() {
    return this.view.manager.dataSource as DatabaseBlockDataSource;
  }

  get rowId() {
    return this.cell.rowId;
  }

  override render() {
    if (!this.value) {
      return html`
        <div
          data-testid="note-cell-create"
          style="${CELL_STYLE}"
          @click="${this._openCreateOrAttachMenu}"
        >
          ${PlusIcon()}
        </div>
      `;
    }

    // `getNoteColor` deliberately returns the raw, unresolved theme
    // `Color` token (e.g. `{dark, light}`), not a paintable CSS string —
    // `getResolvedNoteColor` is the one that actually resolves it against
    // the current theme, exactly like every other renderer of this same
    // value (`list/pc/renderer.ts`'s `getRowNoteColor`).
    const std = this.std;
    const color = std
      ? this.dataSource.getResolvedNoteColor(std, this.rowId)
      : undefined;

    return html`
      <div
        data-testid="note-cell-open"
        style="${CELL_STYLE}${color ? ` color: ${color};` : ''}"
        @click="${this._revealOrInsert}"
      >
        ${PageIcon()}
      </div>
    `;
  }
}

export const noteColumnConfig = notePropertyModelConfig.createPropertyMeta({
  icon: createIcon('LinkIcon'),
  cellRenderer: {
    view: createFromBaseCellRenderer(NoteCell),
  },
});
