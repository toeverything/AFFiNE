import { effects as blockAttachmentEffects } from '@blocksuite/affine-block-attachment/effects';
import { effects as blockBookmarkEffects } from '@blocksuite/affine-block-bookmark/effects';
import { effects as blockCalloutEffects } from '@blocksuite/affine-block-callout/effects';
import { effects as blockCodeEffects } from '@blocksuite/affine-block-code/effects';
import { effects as blockDataViewEffects } from '@blocksuite/affine-block-data-view/effects';
import { effects as blockDatabaseEffects } from '@blocksuite/affine-block-database/effects';
import { effects as blockDividerEffects } from '@blocksuite/affine-block-divider/effects';
import { effects as blockEdgelessTextEffects } from '@blocksuite/affine-block-edgeless-text/effects';
import { effects as blockEmbedEffects } from '@blocksuite/affine-block-embed/effects';
import { effects as blockFrameEffects } from '@blocksuite/affine-block-frame/effects';
import { effects as blockImageEffects } from '@blocksuite/affine-block-image/effects';
import { effects as blockLatexEffects } from '@blocksuite/affine-block-latex/effects';
import { effects as blockListEffects } from '@blocksuite/affine-block-list/effects';
import { effects as blockNoteEffects } from '@blocksuite/affine-block-note/effects';
import { effects as blockParagraphEffects } from '@blocksuite/affine-block-paragraph/effects';
import { effects as blockRootEffects } from '@blocksuite/affine-block-root/effects';
import { effects as blockSurfaceEffects } from '@blocksuite/affine-block-surface/effects';
import { effects as blockSurfaceRefEffects } from '@blocksuite/affine-block-surface-ref/effects';
import { effects as blockTableEffects } from '@blocksuite/affine-block-table/effects';
import { BlockSelection } from '@blocksuite/affine-components/block-selection';
import { BlockZeroWidth } from '@blocksuite/affine-components/block-zero-width';
import { effects as componentCaptionEffects } from '@blocksuite/affine-components/caption';
import { effects as componentCardStyleDropdownMenuEffects } from '@blocksuite/affine-components/card-style-dropdown-menu';
import { effects as componentColorPickerEffects } from '@blocksuite/affine-components/color-picker';
import { effects as componentContextMenuEffects } from '@blocksuite/affine-components/context-menu';
import { effects as componentDatePickerEffects } from '@blocksuite/affine-components/date-picker';
import { effects as componentDropIndicatorEffects } from '@blocksuite/affine-components/drop-indicator';
import { effects as componentEdgelessLineStylesEffects } from '@blocksuite/affine-components/edgeless-line-styles-panel';
import { effects as componentEdgelessLineWidthEffects } from '@blocksuite/affine-components/edgeless-line-width-panel';
import { effects as componentEdgelessShapeColorPickerEffects } from '@blocksuite/affine-components/edgeless-shape-color-picker';
import { effects as componentEmbedCardModalEffects } from '@blocksuite/affine-components/embed-card-modal';
import { FilterableListComponent } from '@blocksuite/affine-components/filterable-list';
import { effects as componentHighlightDropdownMenuEffects } from '@blocksuite/affine-components/highlight-dropdown-menu';
import { IconButton } from '@blocksuite/affine-components/icon-button';
import { effects as componentLinkPreviewEffects } from '@blocksuite/affine-components/link-preview';
import { effects as componentLinkedDocTitleEffects } from '@blocksuite/affine-components/linked-doc-title';
import { effects as componentPortalEffects } from '@blocksuite/affine-components/portal';
import { effects as componentSizeDropdownMenuEffects } from '@blocksuite/affine-components/size-dropdown-menu';
import { SmoothCorner } from '@blocksuite/affine-components/smooth-corner';
import { effects as componentToggleButtonEffects } from '@blocksuite/affine-components/toggle-button';
import { ToggleSwitch } from '@blocksuite/affine-components/toggle-switch';
import { effects as componentToolbarEffects } from '@blocksuite/affine-components/toolbar';
import { effects as componentTooltipContentWithShortcutEffects } from '@blocksuite/affine-components/tooltip-content-with-shortcut';
import { effects as componentViewDropdownMenuEffects } from '@blocksuite/affine-components/view-dropdown-menu';
import { effects as fragmentDocTitleEffects } from '@blocksuite/affine-fragment-doc-title/effects';
import { effects as fragmentFramePanelEffects } from '@blocksuite/affine-fragment-frame-panel/effects';
import { effects as fragmentOutlineEffects } from '@blocksuite/affine-fragment-outline/effects';
import { effects as inlineFootnoteEffects } from '@blocksuite/affine-inline-footnote/effects';
import { effects as inlineLatexEffects } from '@blocksuite/affine-inline-latex/effects';
import { effects as inlineLinkEffects } from '@blocksuite/affine-inline-link/effects';
import { effects as inlineMentionEffects } from '@blocksuite/affine-inline-mention';
import { effects as inlinePresetEffects } from '@blocksuite/affine-inline-preset/effects';
import { effects as inlineReferenceEffects } from '@blocksuite/affine-inline-reference/effects';
import { effects as richTextEffects } from '@blocksuite/affine-rich-text/effects';
import { effects as widgetDragHandleEffects } from '@blocksuite/affine-widget-drag-handle/effects';
import { effects as widgetEdgelessAutoConnectEffects } from '@blocksuite/affine-widget-edgeless-auto-connect/effects';
import { effects as widgetFrameTitleEffects } from '@blocksuite/affine-widget-frame-title/effects';
import { effects as widgetRemoteSelectionEffects } from '@blocksuite/affine-widget-remote-selection/effects';
import { effects as widgetScrollAnchoringEffects } from '@blocksuite/affine-widget-scroll-anchoring/effects';
import { effects as widgetSlashMenuEffects } from '@blocksuite/affine-widget-slash-menu/effects';
import { effects as widgetToolbarEffects } from '@blocksuite/affine-widget-toolbar/effects';
import { effects as stdEffects } from '@blocksuite/block-std/effects';
import { effects as dataViewEffects } from '@blocksuite/data-view/effects';

import { registerSpecs } from './extensions/register.js';

export declare const _GLOBAL_:
  | typeof stdEffects
  | typeof dataViewEffects
  | typeof richTextEffects
  | typeof blockNoteEffects
  | typeof blockAttachmentEffects
  | typeof blockBookmarkEffects
  | typeof blockFrameEffects
  | typeof blockListEffects
  | typeof blockParagraphEffects
  | typeof blockEmbedEffects
  | typeof blockSurfaceEffects
  | typeof blockImageEffects
  | typeof blockDatabaseEffects
  | typeof blockSurfaceRefEffects
  | typeof blockLatexEffects
  | typeof blockEdgelessTextEffects
  | typeof blockDividerEffects
  | typeof blockDataViewEffects
  | typeof blockCodeEffects
  | typeof blockTableEffects
  | typeof blockRootEffects
  | typeof blockCalloutEffects
  | typeof componentCaptionEffects
  | typeof componentContextMenuEffects
  | typeof componentDatePickerEffects
  | typeof componentDropIndicatorEffects
  | typeof componentEmbedCardModalEffects
  | typeof componentHighlightDropdownMenuEffects
  | typeof componentLinkPreviewEffects
  | typeof componentLinkedDocTitleEffects
  | typeof componentPortalEffects
  | typeof componentToolbarEffects
  | typeof componentToggleButtonEffects
  | typeof componentColorPickerEffects
  | typeof componentViewDropdownMenuEffects
  | typeof widgetScrollAnchoringEffects
  | typeof widgetFrameTitleEffects
  | typeof widgetRemoteSelectionEffects
  | typeof widgetDragHandleEffects
  | typeof widgetEdgelessAutoConnectEffects
  | typeof widgetToolbarEffects
  | typeof widgetSlashMenuEffects
  | typeof fragmentDocTitleEffects
  | typeof fragmentFramePanelEffects
  | typeof fragmentOutlineEffects;

export function effects() {
  registerSpecs();

  stdEffects();

  dataViewEffects();
  richTextEffects();

  inlineReferenceEffects();
  inlinePresetEffects();
  inlineLinkEffects();
  inlineFootnoteEffects();
  inlineLatexEffects();
  inlineMentionEffects();

  blockNoteEffects();
  blockAttachmentEffects();
  blockBookmarkEffects();
  blockFrameEffects();
  blockListEffects();
  blockParagraphEffects();
  blockEmbedEffects();
  blockSurfaceEffects();
  blockImageEffects();
  blockDatabaseEffects();
  blockSurfaceRefEffects();
  blockLatexEffects();
  blockEdgelessTextEffects();
  blockDividerEffects();
  blockDataViewEffects();
  blockCodeEffects();
  blockTableEffects();
  blockRootEffects();
  blockCalloutEffects();

  componentCaptionEffects();
  componentContextMenuEffects();
  componentDatePickerEffects();
  componentPortalEffects();
  componentToolbarEffects();
  componentDropIndicatorEffects();
  componentToggleButtonEffects();
  componentColorPickerEffects();
  componentEmbedCardModalEffects();
  componentLinkPreviewEffects();
  componentLinkedDocTitleEffects();
  componentCardStyleDropdownMenuEffects();
  componentHighlightDropdownMenuEffects();
  componentViewDropdownMenuEffects();
  componentTooltipContentWithShortcutEffects();
  componentSizeDropdownMenuEffects();
  componentEdgelessLineWidthEffects();
  componentEdgelessLineStylesEffects();
  componentEdgelessShapeColorPickerEffects();

  widgetScrollAnchoringEffects();
  widgetFrameTitleEffects();
  widgetRemoteSelectionEffects();
  widgetDragHandleEffects();
  widgetEdgelessAutoConnectEffects();
  widgetSlashMenuEffects();
  widgetToolbarEffects();

  fragmentDocTitleEffects();
  fragmentFramePanelEffects();
  fragmentOutlineEffects();

  customElements.define('icon-button', IconButton);
  customElements.define('smooth-corner', SmoothCorner);
  customElements.define('toggle-switch', ToggleSwitch);
  customElements.define('affine-filterable-list', FilterableListComponent);
  customElements.define('block-zero-width', BlockZeroWidth);
  customElements.define('affine-block-selection', BlockSelection);
}
