import { BlockViewExtension, FlavourExtension } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { literal, unsafeStatic } from 'lit/static-html.js';

/**
 * Optional painter used by preview / L0 snapshot scopes.
 * Return a blob id or data URL; `undefined` falls back to the placeholder view.
 */
export type SnapshotPainter = (
  props: Record<string, unknown>
) => string | undefined;

export interface GfxWidgetViewTags {
  page: string;
  edgeless: string;
  preview?: string;
}

export interface GfxWidgetRegistration {
  flavour: string;
  schema: ExtensionType;
  view: GfxWidgetViewTags;
  slash?: ExtensionType | ExtensionType[];
  toolbar?: ExtensionType | ExtensionType[];
  clipboard?: ExtensionType;
  interaction?: ExtensionType;
  adapter?: ExtensionType | ExtensionType[];
  snapshotPainter?: SnapshotPainter;
}

function asList(value?: ExtensionType | ExtensionType[]): ExtensionType[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function registerGfxWidget(
  registration: GfxWidgetRegistration
): GfxWidgetRegistration {
  return registration;
}

export function collectStoreExtensions(
  widgets: readonly GfxWidgetRegistration[]
): ExtensionType[] {
  return widgets.flatMap(widget => [widget.schema, ...asList(widget.adapter)]);
}

export function collectViewExtensions(
  widgets: readonly GfxWidgetRegistration[],
  isPreview: boolean,
  isEdgeless: boolean
): ExtensionType[] {
  return widgets.flatMap(widget => {
    const previewTag = widget.view.preview;
    const tag =
      isPreview && previewTag
        ? previewTag
        : isEdgeless
          ? widget.view.edgeless
          : widget.view.page;

    const extensions: ExtensionType[] = [
      FlavourExtension(widget.flavour),
      BlockViewExtension(widget.flavour, literal`${unsafeStatic(tag)}`),
      ...asList(widget.slash),
      ...asList(widget.toolbar),
    ];

    if (isEdgeless && !isPreview) {
      if (widget.clipboard) extensions.push(widget.clipboard);
      if (widget.interaction) extensions.push(widget.interaction);
    }

    return extensions;
  });
}
