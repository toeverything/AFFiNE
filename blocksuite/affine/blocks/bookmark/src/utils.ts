import { LinkPreviewServiceIdentifier } from '@blocksuite/affine-shared/services';
import { isAbortError } from '@blocksuite/affine-shared/utils';

import type { BookmarkBlockComponent } from './bookmark-block.js';

export async function refreshBookmarkUrlData(
  bookmarkElement: BookmarkBlockComponent,
  signal?: AbortSignal
) {
  let title = null,
    description = null,
    icon = null,
    image = null;

  try {
    bookmarkElement.loading = true;

    const linkPreviewer = bookmarkElement.std.get(LinkPreviewServiceIdentifier);
    const bookmarkUrlData = await linkPreviewer.query(
      bookmarkElement.model.props.url,
      signal
    );

    title = bookmarkUrlData.title ?? null;
    description = bookmarkUrlData.description ?? null;
    icon = bookmarkUrlData.icon ?? null;
    image = bookmarkUrlData.image ?? null;

    if (!title && !description && !icon && !image) {
      bookmarkElement.error = true;
    }

    if (signal?.aborted) return;

    bookmarkElement.store.updateBlock(bookmarkElement.model, {
      title,
      description,
      icon,
      image,
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
    throw error;
  } finally {
    bookmarkElement.loading = false;
  }
}
