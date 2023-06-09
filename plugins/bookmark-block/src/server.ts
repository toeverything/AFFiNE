import type { ServerAdapter } from '@toeverything/plugin-infra/type';
import { getLinkPreview } from 'link-preview-js';

type MetaData = {
  title?: string;
  description?: string;
  icon?: string;
  image?: string;
  [x: string]: string | string[] | undefined;
};

export interface PreviewType {
  url: string;
  title: string;
  siteName: string | undefined;
  description: string | undefined;
  mediaType: string;
  contentType: string | undefined;
  images: string[];
  videos: {
    url: string | undefined;
    secureUrl: string | null | undefined;
    type: string | null | undefined;
    width: string | undefined;
    height: string | undefined;
  }[];
  favicons: string[];
}

const adapter: ServerAdapter = affine => {
  affine.registerCommand(
    'com.blocksuite.bookmark-block.get-bookmark-data-by-link',
    async (url: string): Promise<MetaData> => {
      const previewData = (await getLinkPreview(url, {
        timeout: 6000,
        headers: {
          'user-agent': 'googlebot',
        },
        followRedirects: 'follow',
      }).catch(() => {
        return {
          title: '',
          siteName: '',
          description: '',
          images: [],
          videos: [],
          contentType: `text/html`,
          favicons: [],
        };
      })) as PreviewType;

      return {
        title: previewData.title,
        description: previewData.description,
        icon: previewData.favicons[0],
        image: previewData.images[0],
      };
    }
  );
  return () => {
    affine.unregisterCommand(
      'com.blocksuite.bookmark-block.get-bookmark-data-by-link'
    );
  };
};

export default adapter;
