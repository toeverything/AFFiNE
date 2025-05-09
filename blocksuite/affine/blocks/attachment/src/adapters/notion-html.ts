import { AttachmentBlockSchema } from '@blocksuite/affine-model';
import {
  BlockNotionHtmlAdapterExtension,
  type BlockNotionHtmlAdapterMatcher,
  FetchUtils,
  HastUtils,
} from '@blocksuite/affine-shared/adapters';
import { getFilenameFromContentDisposition } from '@blocksuite/affine-shared/utils';
import { sha } from '@blocksuite/global/utils';
import { getAssetName, nanoid } from '@blocksuite/store';

export const attachmentBlockNotionHtmlAdapterMatcher: BlockNotionHtmlAdapterMatcher =
  {
    flavour: AttachmentBlockSchema.model.flavour,
    toMatch: o => {
      return (
        HastUtils.isElement(o.node) &&
        o.node.tagName === 'figure' &&
        !!HastUtils.querySelector(o.node, '.source')
      );
    },
    fromMatch: () => false,
    toBlockSnapshot: {
      enter: async (o, context) => {
        if (!HastUtils.isElement(o.node)) {
          return;
        }
        const { assets, walkerContext } = context;
        if (!assets) {
          return;
        }

        const embededFigureWrapper = HastUtils.querySelector(o.node, '.source');
        let embededURL = '';
        if (embededFigureWrapper) {
          const embedA = HastUtils.querySelector(embededFigureWrapper, 'a');
          embededURL =
            typeof embedA?.properties.href === 'string'
              ? embedA.properties.href
              : '';
        }
        if (embededURL) {
          let blobId = '';
          let name = '';
          let type = '';
          let size = 0;
          if (!FetchUtils.fetchable(embededURL)) {
            const embededURLSplit = embededURL.split('/');
            while (embededURLSplit.length > 0) {
              const key = assets
                .getPathBlobIdMap()
                .get(decodeURIComponent(embededURLSplit.join('/')));
              if (key) {
                blobId = key;
                break;
              }
              embededURLSplit.shift();
            }
            const value = assets.getAssets().get(blobId);
            if (value) {
              name = getAssetName(assets.getAssets(), blobId);
              size = value.size;
              type = value.type;
            }
          } else {
            const res = await fetch(embededURL).catch(error => {
              console.warn('Error fetching embed:', error);
              return null;
            });
            if (!res) {
              return;
            }
            const resCloned = res.clone();
            name =
              getFilenameFromContentDisposition(
                res.headers.get('Content-Disposition') ?? ''
              ) ??
              (embededURL.split('/').at(-1) ?? 'file') +
                '.' +
                (res.headers.get('Content-Type')?.split('/').at(-1) ?? 'blob');
            const file = new File([await res.blob()], name, {
              type: res.headers.get('Content-Type') ?? '',
            });
            size = file.size;
            type = file.type;
            blobId = await sha(await resCloned.arrayBuffer());
            assets?.getAssets().set(blobId, file);
            await assets?.writeToBlob(blobId);
          }
          walkerContext
            .openNode(
              {
                type: 'block',
                id: nanoid(),
                flavour: AttachmentBlockSchema.model.flavour,
                props: {
                  name,
                  size,
                  type,
                  sourceId: blobId,
                },
                children: [],
              },
              'children'
            )
            .closeNode();
          walkerContext.skipAllChildren();
        }
      },
    },
    fromBlockSnapshot: {},
  };

export const AttachmentBlockNotionHtmlAdapterExtension =
  BlockNotionHtmlAdapterExtension(attachmentBlockNotionHtmlAdapterMatcher);
