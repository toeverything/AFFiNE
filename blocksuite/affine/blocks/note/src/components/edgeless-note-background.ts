import {
  DefaultTheme,
  ListBlockModel,
  NoteBlockModel,
  ParagraphBlockModel,
  StrokeStyle,
} from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import {
  getClosestBlockComponentByPoint,
  handleNativeRangeAtPoint,
  matchModels,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import { clamp, Point } from '@blocksuite/global/gfx';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  type BlockComponent,
  type BlockStdScope,
  PropTypes,
  requiredProperties,
  ShadowlessElement,
  stdContext,
  TextSelection,
} from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';
import { consume } from '@lit/context';
import { computed, effect } from '@preact/signals-core';
import { nothing } from 'lit';
import { property } from 'lit/decorators.js';

import { NoteConfigExtension } from '../config';
import * as styles from './edgeless-note-background.css';

@requiredProperties({
  note: PropTypes.instanceOf(NoteBlockModel),
})
export class EdgelessNoteBackground extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  readonly backgroundStyle$ = computed(() => {
    const themeProvider = this.std.get(ThemeProvider);
    const theme = themeProvider.theme$.value;
    const backgroundColor = themeProvider.generateColorProperty(
      this.note.props.background$.value,
      DefaultTheme.noteBackgrounColor,
      theme
    );

    const { borderRadius, borderSize, borderStyle, shadowType } =
      this.note.props.edgeless$.value.style;

    return {
      borderRadius: borderRadius + 'px',
      backgroundColor: backgroundColor,
      borderWidth: `${borderSize}px`,
      borderStyle: borderStyle === StrokeStyle.Dash ? 'dashed' : borderStyle,
      boxShadow: !shadowType ? 'none' : `var(${shadowType})`,
    };
  });

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get doc() {
    return this.std.host.store;
  }

  private _tryAddParagraph(x: number, y: number) {
    const nearest = getClosestBlockComponentByPoint(
      new Point(x, y)
    ) as BlockComponent | null;
    if (!nearest) return;

    const nearestBBox = nearest.getBoundingClientRect();
    const yRel = y - nearestBBox.top;

    const insertPos: 'before' | 'after' =
      yRel < nearestBBox.height / 2 ? 'before' : 'after';

    const nearestModel = nearest.model as BlockModel;
    const nearestModelIdx = this.note.children.indexOf(nearestModel);

    const children = this.note.children;
    const siblingModel =
      children[
        clamp(
          nearestModelIdx + (insertPos === 'before' ? -1 : 1),
          0,
          children.length
        )
      ];

    if (
      (!nearestModel.text ||
        !matchModels(nearestModel, [ParagraphBlockModel, ListBlockModel])) &&
      (!siblingModel ||
        !siblingModel.text ||
        !matchModels(siblingModel, [ParagraphBlockModel, ListBlockModel]))
    ) {
      const [pId] = this.doc.addSiblingBlocks(
        nearestModel,
        [{ flavour: 'affine:paragraph' }],
        insertPos
      );

      this.updateComplete
        .then(() => {
          this.std.selection.setGroup('note', [
            this.std.selection.create(TextSelection, {
              from: {
                blockId: pId,
                index: 0,
                length: 0,
              },
              to: null,
            }),
          ]);
        })
        .catch(console.error);
    }
  }

  private _handleClickAtBackground(e: MouseEvent) {
    e.stopPropagation();
    if (!this.editing) return;

    const { zoom } = this.gfx.viewport;

    const rect = this.getBoundingClientRect();
    const offsetY = 16 * zoom;
    const offsetX = 2 * zoom;
    const x = clamp(e.x, rect.left + offsetX, rect.right - offsetX);
    const y = clamp(e.y, rect.top + offsetY, rect.bottom - offsetY);
    handleNativeRangeAtPoint(x, y);

    if (this.std.host.store.readonly) return;

    this._tryAddParagraph(x, y);
  }

  private _renderHeader() {
    const header = this.std
      .getOptional(NoteConfigExtension.identifier)
      ?.edgelessNoteHeader({ note: this.note, std: this.std });

    return header;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.classList.add(styles.background);
    this.disposables.add(
      effect(() => {
        Object.assign(this.style, this.backgroundStyle$.value);
      })
    );
    this.disposables.addFromEvent(this, 'pointerdown', stopPropagation);
    this.disposables.addFromEvent(this, 'click', this._handleClickAtBackground);
  }

  override render() {
    return this.note.isPageBlock() ? this._renderHeader() : nothing;
  }

  @consume({ context: stdContext })
  accessor std!: BlockStdScope;

  @property({ attribute: false })
  accessor editing: boolean = false;

  @property({ attribute: false })
  accessor note!: NoteBlockModel;
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-note-background': EdgelessNoteBackground;
  }
}
