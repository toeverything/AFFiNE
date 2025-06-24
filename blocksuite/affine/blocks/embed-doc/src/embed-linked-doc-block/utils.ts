import {
  EmbedEdgelessIcon,
  EmbedPageIcon,
} from '@blocksuite/affine-components/icons';
import {
  ColorScheme,
  type EmbedLinkedDocStyles,
} from '@blocksuite/affine-model';
import type { TemplateResult } from 'lit';

import {
  DarkSyncedDocErrorBanner,
  LightSyncedDocErrorBanner,
} from '../embed-synced-doc-block/styles.js';
import {
  DarkLinkedEdgelessDeletedLargeBanner,
  DarkLinkedEdgelessDeletedSmallBanner,
  DarkLinkedEdgelessEmptyLargeBanner,
  DarkLinkedEdgelessEmptySmallBanner,
  DarkLinkedPageDeletedLargeBanner,
  DarkLinkedPageDeletedSmallBanner,
  DarkLinkedPageEmptyLargeBanner,
  DarkLinkedPageEmptySmallBanner,
  LightLinkedEdgelessDeletedLargeBanner,
  LightLinkedEdgelessDeletedSmallBanner,
  LightLinkedEdgelessEmptyLargeBanner,
  LightLinkedEdgelessEmptySmallBanner,
  LightLinkedPageDeletedLargeBanner,
  LightLinkedPageDeletedSmallBanner,
  LightLinkedPageEmptyLargeBanner,
  LightLinkedPageEmptySmallBanner,
  LinkedDocDeletedIcon,
} from './styles.js';

type EmbedCardImages = {
  LinkedDocIcon: TemplateResult<1>;
  LinkedDocDeletedIcon: TemplateResult<1>;
  LinkedDocEmptyBanner: TemplateResult<1>;
  LinkedDocDeletedBanner: TemplateResult<1>;
  SyncedDocErrorBanner: TemplateResult<1>;
};

export function getEmbedLinkedDocIcons(
  theme: ColorScheme,
  editorMode: 'page' | 'edgeless',
  style: (typeof EmbedLinkedDocStyles)[number]
): EmbedCardImages {
  const small = style !== 'vertical';
  if (editorMode === 'page') {
    if (theme === ColorScheme.Light) {
      return {
        LinkedDocIcon: EmbedPageIcon,
        LinkedDocDeletedIcon,
        LinkedDocEmptyBanner: small
          ? LightLinkedPageEmptySmallBanner
          : LightLinkedPageEmptyLargeBanner,
        LinkedDocDeletedBanner: small
          ? LightLinkedPageDeletedSmallBanner
          : LightLinkedPageDeletedLargeBanner,
        SyncedDocErrorBanner: LightSyncedDocErrorBanner,
      };
    } else {
      return {
        LinkedDocIcon: EmbedPageIcon,
        LinkedDocDeletedIcon,
        LinkedDocEmptyBanner: small
          ? DarkLinkedPageEmptySmallBanner
          : DarkLinkedPageEmptyLargeBanner,
        LinkedDocDeletedBanner: small
          ? DarkLinkedPageDeletedSmallBanner
          : DarkLinkedPageDeletedLargeBanner,
        SyncedDocErrorBanner: DarkSyncedDocErrorBanner,
      };
    }
  } else {
    if (theme === ColorScheme.Light) {
      return {
        LinkedDocIcon: EmbedEdgelessIcon,
        LinkedDocDeletedIcon,
        LinkedDocEmptyBanner: small
          ? LightLinkedEdgelessEmptySmallBanner
          : LightLinkedEdgelessEmptyLargeBanner,
        LinkedDocDeletedBanner: small
          ? LightLinkedEdgelessDeletedSmallBanner
          : LightLinkedEdgelessDeletedLargeBanner,
        SyncedDocErrorBanner: LightSyncedDocErrorBanner,
      };
    } else {
      return {
        LinkedDocIcon: EmbedEdgelessIcon,
        LinkedDocDeletedIcon,
        LinkedDocEmptyBanner: small
          ? DarkLinkedEdgelessEmptySmallBanner
          : DarkLinkedEdgelessEmptyLargeBanner,
        LinkedDocDeletedBanner: small
          ? DarkLinkedEdgelessDeletedSmallBanner
          : DarkLinkedEdgelessDeletedLargeBanner,
        SyncedDocErrorBanner: DarkSyncedDocErrorBanner,
      };
    }
  }
}
