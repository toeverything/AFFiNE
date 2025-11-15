import { getNotesFromDoc } from '@blocksuite/affine-block-embed';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine-ext-loader';
import {
  ImageBlockModel,
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { EMBED_CARD_HEIGHT } from '@blocksuite/affine-shared/consts';
import { matchModels } from '@blocksuite/affine-shared/utils';
import { BlockStdScope } from '@blocksuite/std';
import type { BlockModel, Query } from '@blocksuite/store';
import { render, type TemplateResult } from 'lit';

import type { EmbedLinkedDocBlockComponent } from '../embed-linked-doc-block';
import type { EmbedSyncedDocCard } from '../embed-synced-doc-block/components/embed-synced-doc-card';

export function renderLinkedDocInCard(
  card: EmbedLinkedDocBlockComponent | EmbedSyncedDocCard
) {
  const linkedDoc = card.linkedDoc;
  if (!linkedDoc) {
    console.error(
      `Trying to load page ${card.model.props.pageId} in linked page block, but the page is not found.`
    );
    return;
  }

  // eslint-disable-next-line sonarjs/no-collapsible-if
  if ('bannerContainer' in card) {
    if (card.editorMode === 'page') {
      renderPageAsBanner(card).catch(e => {
        console.error(e);
        card.isError = true;
      });
    }
  }

  renderNoteContent(card).catch(e => {
    console.error(e);
    card.isError = true;
  });
}

async function renderPageAsBanner(card: EmbedSyncedDocCard) {
  const linkedDoc = card.linkedDoc;
  if (!linkedDoc) {
    console.error(
      `Trying to load page ${card.model.props.pageId} in linked page block, but the page is not found.`
    );
    return;
  }

  const notes = getNotesFromDoc(linkedDoc);
  if (!notes) {
    card.isBannerEmpty = true;
    return;
  }

  const target = notes.flatMap(note =>
    note.children.filter(child => matchModels(child, [ImageBlockModel]))
  )[0];

  if (target) {
    await renderImageAsBanner(card, target);
    return;
  }

  card.isBannerEmpty = true;
}

async function renderImageAsBanner(
  card: EmbedSyncedDocCard,
  image: BlockModel
) {
  const sourceId = (image as ImageBlockModel).props.sourceId;
  if (!sourceId) return;

  const storage = card.linkedDoc?.blobSync;
  if (!storage) return;

  const blob = await storage.get(sourceId);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const $img = document.createElement('img');
  $img.src = url;
  await addCover(card, $img);

  card.isBannerEmpty = false;
}

async function addCover(
  card: EmbedSyncedDocCard,
  cover: HTMLElement | TemplateResult<1>
) {
  const coverContainer = await card.bannerContainer;
  if (!coverContainer) return;
  while (coverContainer.firstChild) {
    coverContainer.firstChild.remove();
  }

  if (cover instanceof HTMLElement) {
    coverContainer.append(cover);
  } else {
    render(cover, coverContainer);
  }
}

async function renderNoteContent(
  card: EmbedLinkedDocBlockComponent | EmbedSyncedDocCard
) {
  card.isNoteContentEmpty = true;

  const doc = card.linkedDoc;
  if (!doc) {
    console.error(
      `Trying to load page ${card.model.props.pageId} in linked page block, but the page is not found.`
    );
    return;
  }

  const notes = getNotesFromDoc(doc);
  if (!notes) {
    return;
  }

  const cardStyle = card.model.props.style;
  const isHorizontal = cardStyle === 'horizontal';
  const allowFlavours = isHorizontal ? [] : [ImageBlockModel];

  const noteChildren = notes.flatMap(note =>
    note.children.filter(model => {
      if (matchModels(model, allowFlavours)) {
        return true;
      }
      return filterTextModel(model);
    })
  );

  if (!noteChildren.length) {
    return;
  }

  card.isNoteContentEmpty = false;

  const noteContainer = await card.noteContainer;

  if (!noteContainer) {
    return;
  }

  while (noteContainer.firstChild) {
    noteContainer.firstChild.remove();
  }

  const noteBlocksContainer = document.createElement('div');
  noteBlocksContainer.classList.add('affine-embed-doc-content-note-blocks');
  noteBlocksContainer.contentEditable = 'false';
  noteContainer.append(noteBlocksContainer);

  if (isHorizontal) {
    // When the card is horizontal, we only render the first block
    noteChildren.splice(1);
  } else {
    // Before rendering, we can not know the height of each block
    // But we can limit the number of blocks to render simply by the height of the card
    const cardHeight = EMBED_CARD_HEIGHT[cardStyle];
    const minSingleBlockHeight = 20;
    const maxBlockCount = Math.floor(cardHeight / minSingleBlockHeight);
    if (noteChildren.length > maxBlockCount) {
      noteChildren.splice(maxBlockCount);
    }
  }
  const childIds = noteChildren.map(child => child.id);
  const ids: string[] = [];
  childIds.forEach(block => {
    let parent: string | null = block;
    while (parent && !ids.includes(parent)) {
      ids.push(parent);
      parent = doc.getParent(parent)?.id ?? null;
    }
  });
  const query: Query = {
    mode: 'strict',
    match: ids.map(id => ({ id, viewType: 'display' })),
  };
  const previewDoc = doc.doc.getStore({ query });
  const std = card.host.std;
  const previewSpec = std
    .get(ViewExtensionManagerIdentifier)
    .get('preview-page');
  const previewStd = new BlockStdScope({
    store: previewDoc,
    extensions: previewSpec,
  });
  const previewTemplate = previewStd.render();
  const fragment = document.createDocumentFragment();
  render(previewTemplate, fragment);
  noteBlocksContainer.append(fragment);
  const contentEditableElements = noteBlocksContainer.querySelectorAll(
    '[contenteditable="true"]'
  );
  contentEditableElements.forEach(element => {
    (element as HTMLElement).contentEditable = 'false';
  });
}

function filterTextModel(model: BlockModel) {
  if (matchModels(model, [ParagraphBlockModel, ListBlockModel])) {
    return !!model.text?.toString().length;
  }
  return false;
}
