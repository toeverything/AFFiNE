import type {
  EmbedYoutubeBlockUrlData,
  EmbedYoutubeModel,
} from '@blocksuite/affine-model';
import type { LinkPreviewProvider } from '@blocksuite/affine-shared/services';
import { isAbortError } from '@blocksuite/affine-shared/utils';

import type { EmbedYoutubeBlockComponent } from './embed-youtube-block.js';

export async function queryEmbedYoutubeData(
  embedYoutubeModel: EmbedYoutubeModel,
  linkPreviewer: LinkPreviewProvider,
  signal?: AbortSignal
): Promise<Partial<EmbedYoutubeBlockUrlData>> {
  const data = await linkPreviewer.query(embedYoutubeModel.props.url, signal);
  return {
    title: data.title,
    description: data.description,
    image: data.image,
    creator: data.author?.name,
    creatorImage: data.author?.avatar,
  };
}

export async function refreshEmbedYoutubeUrlData(
  embedYoutubeElement: EmbedYoutubeBlockComponent,
  signal?: AbortSignal
): Promise<void> {
  if (embedYoutubeElement.store.readonly) return;
  let image = null,
    title = null,
    description = null,
    creator = null,
    creatorUrl = null,
    creatorImage = null;

  try {
    embedYoutubeElement.loading = true;

    // TODO(@mirone): remove service
    const queryUrlData = embedYoutubeElement.service?.queryUrlData;
    if (!queryUrlData) {
      console.error(
        `Trying to refresh youtube url data, but the queryUrlData is not found.`
      );
      return;
    }

    const youtubeUrlData = await queryUrlData(
      embedYoutubeElement.model,
      signal
    );

    ({
      image = null,
      title = null,
      description = null,
      creator = null,
      creatorUrl = embedYoutubeElement.model.props.creatorUrl,
      creatorImage = null,
    } = youtubeUrlData);

    if (signal?.aborted || embedYoutubeElement.store.readonly) return;

    embedYoutubeElement.store.updateBlock(embedYoutubeElement.model, {
      image,
      title,
      description,
      creator,
      creatorUrl,
      creatorImage,
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) return;
    throw error;
  } finally {
    embedYoutubeElement.loading = false;
  }
}
