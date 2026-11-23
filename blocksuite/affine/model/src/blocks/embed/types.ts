import type { GfxModel } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

import type { BookmarkBlockModel } from '../bookmark';
import { EmbedFigmaModel } from './figma';
import { EmbedGithubModel } from './github';
import type { EmbedHtmlModel } from './html';
import type { EmbedIframeBlockModel } from './iframe/';
import { EmbedLinkedDocModel } from './linked-doc';
import { EmbedLoomModel } from './loom';
import { EmbedSyncedDocModel } from './synced-doc';
import { EmbedYoutubeModel } from './youtube';

export const ExternalEmbedModels = [
  EmbedFigmaModel,
  EmbedGithubModel,
  EmbedLoomModel,
  EmbedYoutubeModel,
] as const;

export const InternalEmbedModels = [
  EmbedLinkedDocModel,
  EmbedSyncedDocModel,
] as const;

export type ExternalEmbedModel = (typeof ExternalEmbedModels)[number];

export type InternalEmbedModel = (typeof InternalEmbedModels)[number];

export type EmbedCardModel = InstanceType<
  ExternalEmbedModel | InternalEmbedModel
>;

export type LinkableEmbedModel =
  | EmbedCardModel
  | EmbedIframeBlockModel
  | BookmarkBlockModel;

export type BuiltInEmbedModel = EmbedCardModel | EmbedHtmlModel;

export function isExternalEmbedModel(
  model: GfxModel | BlockModel
): model is InstanceType<ExternalEmbedModel> {
  return (
    model instanceof EmbedFigmaModel ||
    model instanceof EmbedGithubModel ||
    model instanceof EmbedLoomModel ||
    model instanceof EmbedYoutubeModel
  );
}

export function isInternalEmbedModel(
  model: GfxModel | BlockModel
): model is InstanceType<InternalEmbedModel> {
  return (
    model instanceof EmbedLinkedDocModel || model instanceof EmbedSyncedDocModel
  );
}
