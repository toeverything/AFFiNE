import {
  EmbedEdgelessIcon,
  EmbedPageIcon,
} from '@blocksuite/affine-components/icons';
import { ColorScheme } from '@blocksuite/affine-model';
import type { BlockComponent } from '@blocksuite/std';
import type { TemplateResult } from 'lit';

import { EmbedEdgelessSyncedDocBlockComponent } from './embed-edgeless-synced-doc-block.js';
import {
  DarkSyncedDocDeletedBanner,
  DarkSyncedDocEmptyBanner,
  DarkSyncedDocErrorBanner,
  LightSyncedDocDeletedBanner,
  LightSyncedDocEmptyBanner,
  LightSyncedDocErrorBanner,
  SyncedDocDeletedIcon,
  SyncedDocErrorIcon,
} from './styles.js';

type SyncedCardImages = {
  SyncedDocIcon: TemplateResult<1>;
  SyncedDocErrorIcon: TemplateResult<1>;
  SyncedDocDeletedIcon: TemplateResult<1>;
  SyncedDocEmptyBanner: TemplateResult<1>;
  SyncedDocErrorBanner: TemplateResult<1>;
  SyncedDocDeletedBanner: TemplateResult<1>;
};

export function getSyncedDocIcons(
  theme: ColorScheme,
  editorMode: 'page' | 'edgeless'
): SyncedCardImages {
  if (theme === ColorScheme.Light) {
    return {
      SyncedDocIcon: editorMode === 'page' ? EmbedPageIcon : EmbedEdgelessIcon,
      SyncedDocErrorIcon,
      SyncedDocDeletedIcon,
      SyncedDocEmptyBanner: LightSyncedDocEmptyBanner,
      SyncedDocErrorBanner: LightSyncedDocErrorBanner,
      SyncedDocDeletedBanner: LightSyncedDocDeletedBanner,
    };
  } else {
    return {
      SyncedDocIcon: editorMode === 'page' ? EmbedPageIcon : EmbedEdgelessIcon,
      SyncedDocErrorIcon,
      SyncedDocDeletedIcon,
      SyncedDocEmptyBanner: DarkSyncedDocEmptyBanner,
      SyncedDocErrorBanner: DarkSyncedDocErrorBanner,
      SyncedDocDeletedBanner: DarkSyncedDocDeletedBanner,
    };
  }
}

/**
 * This function will return the height of the synced doc block
 */
export function calcSyncedDocFullHeight(block: BlockComponent) {
  if (!(block instanceof EmbedEdgelessSyncedDocBlockComponent)) {
    return 0;
  }
  const headerHeight = block.headerWrapper?.getBoundingClientRect().height ?? 0;
  // When the content is not found, we use a default height to display empty information
  const contentHeight =
    block.contentElement?.getBoundingClientRect().height ?? 200;

  const bottomPadding = 8;

  return (
    (headerHeight + contentHeight + bottomPadding) /
    block.gfx.viewport.zoom /
    (block.model.props.scale ?? 1)
  );
}
