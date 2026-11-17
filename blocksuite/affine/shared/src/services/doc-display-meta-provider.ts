import type { AliasInfo, ReferenceParams } from '@blocksuite/affine-model';
import { createIdentifier } from '@blocksuite/global/di';
import type { ReadonlySignal } from '@preact/signals-core';
import type { TemplateResult } from 'lit';

export type DocDisplayMetaParams = {
  referenced?: boolean;
  params?: ReferenceParams;
} & AliasInfo;

/**
 * Customize document display title and icon.
 *
 * Supports the following blocks:
 *
 * * Inline View:
 *      `AffineReference`
 * * Card View:
 *      `EmbedLinkedDocBlockComponent`
 *      `EmbedEdgelessLinkedDocBlockComponent`
 * * Embed View:
 *      `EmbedSyncedDocBlockComponent`
 *      `EmbedEdgelessSyncedDocBlockComponent`
 */
export interface DocDisplayMetaExtension {
  icon: (
    docId: string,
    referenceInfo?: DocDisplayMetaParams
  ) => ReadonlySignal<TemplateResult>;
  title: (
    docId: string,
    referenceInfo?: DocDisplayMetaParams
  ) => ReadonlySignal<string>;
}

export const DocDisplayMetaProvider = createIdentifier<DocDisplayMetaExtension>(
  'DocDisplayMetaService'
);
