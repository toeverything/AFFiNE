import { ViewExtensionManagerIdentifier } from '@blocksuite/affine-ext-loader';
import {
  DocModeExtension,
  DocModeProvider,
  EditorSettingExtension,
  EditorSettingProvider,
} from '@blocksuite/affine-shared/services';
import { BlockStdScope, BlockViewIdentifier } from '@blocksuite/std';
import type {
  BlockModel,
  BlockViewType,
  ExtensionType,
  Query,
  SliceSnapshot,
} from '@blocksuite/store';
import { signal } from '@preact/signals-core';
import { literal } from 'lit/static-html.js';

import { EdgelessDndPreviewElement } from '../components/edgeless-preview/preview.js';
import type { AffineDragHandleWidget } from '../drag-handle.js';

export class PreviewHelper {
  private readonly _calculateQuery = (selectedIds: string[]): Query => {
    const ids: Array<{ id: string; viewType: BlockViewType }> = selectedIds.map(
      id => ({
        id,
        viewType: 'display',
      })
    );

    // The ancestors of the selected blocks should be rendered as Bypass
    selectedIds.forEach(block => {
      let parent: string | null = block;
      do {
        if (!selectedIds.includes(parent)) {
          ids.push({ viewType: 'bypass', id: parent });
        }
        parent = this.widget.store.getParent(parent)?.id ?? null;
      } while (parent && !ids.map(({ id }) => id).includes(parent));
    });

    // The children of the selected blocks should be rendered as Display
    const addChildren = (id: string) => {
      const model = this.widget.store.getBlock(id)?.model;
      if (!model) {
        return;
      }

      const children = model.children ?? [];
      children.forEach(child => {
        ids.push({ viewType: 'display', id: child.id });
        addChildren(child.id);
      });
    };
    selectedIds.forEach(addChildren);

    return {
      match: ids,
      mode: 'strict',
    };
  };

  getPreviewStd = (blockIds: string[]) => {
    const widget = this.widget;
    const std = widget.std;
    blockIds = blockIds.slice();

    const docModeService = std.get(DocModeProvider);
    const editorSetting = std.get(EditorSettingProvider);
    const query = this._calculateQuery(blockIds as string[]);
    const store = widget.store.doc.getStore({ query });
    let previewSpec = widget.std
      .get(ViewExtensionManagerIdentifier)
      .get('preview-page');
    const settingSignal = signal({ ...editorSetting.setting$.peek() });
    const extensions = [
      DocModeExtension(docModeService),
      EditorSettingExtension({ setting$: settingSignal }),
      {
        setup(di) {
          di.override(
            BlockViewIdentifier('affine:database'),
            () => literal`affine-dnd-preview-database`
          );
        },
      } as ExtensionType,
      {
        setup(di) {
          di.override(BlockViewIdentifier('affine:image'), () => {
            return (model: BlockModel) => {
              const parent = model.store.getParent(model.id);

              if (parent?.flavour === 'affine:surface') {
                return literal`affine-edgeless-placeholder-preview-image`;
              }

              return literal`affine-placeholder-preview-image`;
            };
          });
        },
      } as ExtensionType,
    ];

    previewSpec = previewSpec.concat(extensions);

    settingSignal.value = {
      ...settingSignal.value,
      edgelessDisableScheduleUpdate: true,
    };

    const previewStd = new BlockStdScope({
      store,
      extensions: previewSpec,
    });

    let width: number = 500;
    // oxlint-disable-next-line no-unassigned-vars
    let height;

    const noteBlock = this.widget.host.querySelector('affine-note');
    width = noteBlock?.offsetWidth ?? noteBlock?.clientWidth ?? 500;

    return {
      previewStd,
      width,
      height,
    };
  };

  private _extractBlockTypes(snapshot: SliceSnapshot) {
    const blockTypes: {
      type: string;
    }[] = [];

    snapshot.content.forEach(block => {
      if (block.flavour === 'affine:surface') {
        Object.values(
          block.props.elements as Record<string, { id: string; type: string }>
        ).forEach(elem => {
          blockTypes.push({
            type: elem.type,
          });
        });
      } else {
        blockTypes.push({
          type: block.flavour,
        });
      }
    });

    return blockTypes;
  }

  getPreviewElement = (options: {
    blockIds: string[];
    snapshot: SliceSnapshot;
    mode: 'block' | 'gfx';
  }) => {
    const { blockIds, snapshot, mode } = options;

    if (mode === 'block') {
      const { previewStd, width, height } = this.getPreviewStd(blockIds);
      const previewTemplate = previewStd.render();

      return {
        width,
        height,
        element: previewTemplate,
      };
    } else {
      const blockTypes = this._extractBlockTypes(snapshot);

      const edgelessPreview = new EdgelessDndPreviewElement();
      edgelessPreview.elementTypes = blockTypes;

      return {
        left: 12,
        top: 12,
        element: edgelessPreview,
      };
    }
  };

  renderDragPreview = (options: {
    blockIds: string[];
    snapshot: SliceSnapshot;
    container: HTMLElement;
    mode: 'block' | 'gfx';
  }): { x: number; y: number } => {
    const { container } = options;
    const { width, height, element, left, top } =
      this.getPreviewElement(options);

    container.style.position = 'absolute';
    container.style.left = left ? `${left}px` : '';
    container.style.top = top ? `${top}px` : '';
    container.style.width = width ? `${width}px` : '';
    container.style.height = height ? `${height}px` : '';
    container.append(element);

    return {
      x: left ?? 0,
      y: top ?? 0,
    };
  };

  constructor(readonly widget: AffineDragHandleWidget) {}
}
