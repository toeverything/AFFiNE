import { BlockModel } from '@blocksuite/store';

import type { EmbedCardStyle } from '../../../utils/index.js';
import { defineEmbedModel } from '../../../utils/index.js';

export const youtubeUrlRegex: RegExp =
  /(?:https?:\/\/)?(?:(?:www|m)\.)?youtu\.?be(?:\.com)?\/?.*(?:watch|embed)?(?:.*v=|v\/|\/)([\w-_]+)/;

export type EmbedYoutubeBlockUrlData = {
  videoId: string | null;
  image: string | null;
  title: string | null;
  description: string | null;
  creator: string | null;
  creatorUrl: string | null;
  creatorImage: string | null;
};

export const EmbedYoutubeStyles = ['video'] as const satisfies EmbedCardStyle[];

export type EmbedYoutubeBlockProps = {
  style: (typeof EmbedYoutubeStyles)[number];
  url: string;
  caption: string | null;
} & EmbedYoutubeBlockUrlData;

export class EmbedYoutubeModel extends defineEmbedModel<EmbedYoutubeBlockProps>(
  BlockModel
) {
  constructor() {
    super();
    const createdSubscription = this.created.subscribe(() => {
      createdSubscription.unsubscribe();
      this.syncVideoId();
      this.propsUpdated.subscribe(({ key }) => {
        if (key === 'url') this.syncVideoId();
      });
    });
  }

  private syncVideoId() {
    if (this.store.readonly) return;
    const videoId = this.props.url.match(youtubeUrlRegex)?.[1] ?? null;
    if (this.props.videoId !== videoId) {
      this.store.withoutTransact(() =>
        this.store.updateBlock(this, { videoId })
      );
    }
  }
}
