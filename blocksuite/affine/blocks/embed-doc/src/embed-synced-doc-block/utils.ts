import {
  EmbedEdgelessIcon,
  EmbedPageIcon,
  getLoadingIconWith,
  ReloadIcon,
} from '@blocksuite/affine-components/icons';
import { ColorScheme } from '@blocksuite/affine-model';
import type { TemplateResult } from 'lit';

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
  LoadingIcon: TemplateResult<1>;
  SyncedDocIcon: TemplateResult<1>;
  SyncedDocErrorIcon: TemplateResult<1>;
  SyncedDocDeletedIcon: TemplateResult<1>;
  ReloadIcon: TemplateResult<1>;
  SyncedDocEmptyBanner: TemplateResult<1>;
  SyncedDocErrorBanner: TemplateResult<1>;
  SyncedDocDeletedBanner: TemplateResult<1>;
};

export function getSyncedDocIcons(
  theme: ColorScheme,
  editorMode: 'page' | 'edgeless'
): SyncedCardImages {
  const LoadingIcon = getLoadingIconWith(theme);
  if (theme === ColorScheme.Light) {
    return {
      LoadingIcon,
      SyncedDocIcon: editorMode === 'page' ? EmbedPageIcon : EmbedEdgelessIcon,
      SyncedDocErrorIcon,
      SyncedDocDeletedIcon,
      ReloadIcon,
      SyncedDocEmptyBanner: LightSyncedDocEmptyBanner,
      SyncedDocErrorBanner: LightSyncedDocErrorBanner,
      SyncedDocDeletedBanner: LightSyncedDocDeletedBanner,
    };
  } else {
    return {
      LoadingIcon,
      SyncedDocIcon: editorMode === 'page' ? EmbedPageIcon : EmbedEdgelessIcon,
      SyncedDocErrorIcon,
      SyncedDocDeletedIcon,
      ReloadIcon,
      SyncedDocEmptyBanner: DarkSyncedDocEmptyBanner,
      SyncedDocErrorBanner: DarkSyncedDocErrorBanner,
      SyncedDocDeletedBanner: DarkSyncedDocDeletedBanner,
    };
  }
}
