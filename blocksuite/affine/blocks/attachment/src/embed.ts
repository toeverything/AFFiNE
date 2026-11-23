import {
  type AttachmentBlockModel,
  type ImageBlockProps,
  MAX_IMAGE_WIDTH,
} from '@blocksuite/affine-model';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import { FileSizeLimitProvider } from '@blocksuite/affine-shared/services';
import {
  readImageSize,
  transformModel,
  withTempBlobData,
} from '@blocksuite/affine-shared/utils';
import type { Container } from '@blocksuite/global/di';
import { createIdentifier } from '@blocksuite/global/di';
import { Bound } from '@blocksuite/global/gfx';
import { type BlockStdScope, StdIdentifier } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';
import { Extension } from '@blocksuite/store';
import type { TemplateResult } from 'lit';
import { html } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';

import { getAttachmentBlob } from './utils';

export type AttachmentEmbedConfig = {
  name: string;
  /**
   * Check if the attachment can be turned into embed view.
   */
  check: (model: AttachmentBlockModel, maxFileSize: number) => boolean;
  /**
   * The action will be executed when the 「Turn into embed view」 button is clicked.
   */
  action?: (
    model: AttachmentBlockModel,
    std: BlockStdScope
  ) => Promise<void> | void;
  /**
   * Renders the embed view.
   */
  render?: (
    model: AttachmentBlockModel,
    blobUrl: string
  ) => TemplateResult | null;

  /**
   * Should show status when turned on.
   */
  shouldShowStatus?: boolean;

  /**
   * Should block type conversion be required.
   */
  shouldBeConverted?: boolean;
};

// Single embed config.
export const AttachmentEmbedConfigIdentifier =
  createIdentifier<AttachmentEmbedConfig>(
    'AffineAttachmentEmbedConfigIdentifier'
  );

export function AttachmentEmbedConfigExtension(
  configs: AttachmentEmbedConfig[] = embedConfig
): ExtensionType {
  return {
    setup: di => {
      configs.forEach(option => {
        di.addImpl(AttachmentEmbedConfigIdentifier(option.name), () => option);
      });
    },
  };
}

// A embed config map.
export const AttachmentEmbedConfigMapIdentifier = createIdentifier<
  Map<string, AttachmentEmbedConfig>
>('AffineAttachmentEmbedConfigMapIdentifier');

export const AttachmentEmbedProvider = createIdentifier<AttachmentEmbedService>(
  'AffineAttachmentEmbedProvider'
);

export class AttachmentEmbedService extends Extension {
  private get _maxFileSize() {
    return this.std.get(FileSizeLimitProvider).maxFileSize;
  }

  get keys() {
    return this.configs.keys();
  }

  get values() {
    return this.configs.values();
  }

  get configs(): Map<string, AttachmentEmbedConfig> {
    return this.std.get(AttachmentEmbedConfigMapIdentifier);
  }

  constructor(private readonly std: BlockStdScope) {
    super();
  }

  static override setup(di: Container) {
    di.addImpl(AttachmentEmbedConfigMapIdentifier, provider =>
      provider.getAll(AttachmentEmbedConfigIdentifier)
    );
    di.addImpl(AttachmentEmbedProvider, this, [StdIdentifier]);
  }

  // Converts to embed view.
  convertTo(model: AttachmentBlockModel, maxFileSize = this._maxFileSize) {
    const config = this.values.find(config => config.check(model, maxFileSize));

    if (config?.action) {
      config.action(model, this.std)?.catch(console.error);
      return;
    }

    model.store.updateBlock(model, { embed: true });
  }

  embedded(model: AttachmentBlockModel, maxFileSize = this._maxFileSize) {
    return this.values.some(config => config.check(model, maxFileSize));
  }

  getRender(model: AttachmentBlockModel, maxFileSize = this._maxFileSize) {
    return (
      this.values.find(config => config.check(model, maxFileSize))?.render ??
      null
    );
  }

  shouldShowStatus(
    model: AttachmentBlockModel,
    maxFileSize = this._maxFileSize
  ) {
    return (
      this.values.find(config => config.check(model, maxFileSize))
        ?.shouldShowStatus ?? false
    );
  }

  shouldBeConverted(
    model: AttachmentBlockModel,
    maxFileSize = this._maxFileSize
  ) {
    return (
      this.values.find(config => config.check(model, maxFileSize))
        ?.shouldBeConverted ?? false
    );
  }
}

const embedConfig: AttachmentEmbedConfig[] = [
  {
    name: 'image',
    shouldBeConverted: true,
    check: model =>
      model.store.schema.flavourSchemaMap.has('affine:image') &&
      model.props.type.startsWith('image/'),
    async action(model, std) {
      const component = std.view.getBlock(model.id);
      if (!component) return;

      await turnIntoImageBlock(model);
    },
  },
  {
    name: 'pdf',
    shouldShowStatus: true,
    check: (model, maxFileSize) =>
      model.props.type === 'application/pdf' && model.props.size <= maxFileSize,
    action: model => {
      const bound = Bound.deserialize(model.props.xywh);
      bound.w = EMBED_CARD_WIDTH.pdf;
      bound.h = EMBED_CARD_HEIGHT.pdf;
      model.store.updateBlock(model, {
        embed: true,
        style: 'pdf',
        xywh: bound.serialize(),
      });
    },
    render: (_, blobUrl) => {
      // More options: https://tinytip.co/tips/html-pdf-params/
      // https://chromium.googlesource.com/chromium/src/+/refs/tags/121.0.6153.1/chrome/browser/resources/pdf/open_pdf_params_parser.ts
      const parameters = '#toolbar=0';
      return html`
        <iframe
          style=${styleMap({
            width: '100%',
            minHeight: '480px',
            colorScheme: 'auto',
          })}
          src=${blobUrl + parameters}
          loading="lazy"
          scrolling="no"
          frameborder="no"
          allowTransparency
          allowfullscreen
          type="application/pdf"
          credentialless
        ></iframe>
        <div class="affine-attachment-embed-event-mask"></div>
      `;
    },
  },
  {
    name: 'video',
    shouldShowStatus: true,
    check: (model, maxFileSize) =>
      model.props.type.startsWith('video/') && model.props.size <= maxFileSize,
    action: model => {
      const bound = Bound.deserialize(model.props.xywh);
      bound.w = EMBED_CARD_WIDTH.video;
      bound.h = EMBED_CARD_HEIGHT.video;
      model.store.updateBlock(model, {
        embed: true,
        style: 'video',
        xywh: bound.serialize(),
      });
    },
    render: (_, blobUrl) =>
      html`<video
        style=${styleMap({
          display: 'flex',
          objectFit: 'cover',
          backgroundSize: 'cover',
          width: '100%',
          height: '100%',
        })}
        src=${blobUrl}
        width="100%"
        height="100%"
        controls
      ></video>`,
  },
  {
    name: 'audio',
    check: (model, maxFileSize) =>
      model.props.type.startsWith('audio/') && model.props.size <= maxFileSize,
    render: (_, blobUrl) =>
      html`<audio
        style=${styleMap({ margin: '4px' })}
        src=${blobUrl}
        controls
      ></audio>`,
  },
];

/**
 * Turn the attachment block into an image block.
 */
async function turnIntoImageBlock(model: AttachmentBlockModel) {
  if (!model.store.schema.flavourSchemaMap.has('affine:image')) {
    console.error('The image flavour is not supported!');
    return;
  }

  const sourceId = model.props.sourceId;
  if (!sourceId) return;

  const { saveAttachmentData, getImageData } = withTempBlobData();
  saveAttachmentData(sourceId, { name: model.props.name });

  let imageSize = model.props.sourceId
    ? getImageData(model.props.sourceId)
    : undefined;

  const bounds = model.xywh
    ? Bound.fromXYWH(model.deserializedXYWH)
    : undefined;

  if (bounds) {
    if (!imageSize?.width || !imageSize?.height) {
      const blob = await getAttachmentBlob(model);
      if (blob) {
        imageSize = await readImageSize(blob);
      }
    }

    if (imageSize?.width && imageSize?.height) {
      const p = imageSize.height / imageSize.width;
      imageSize.width = Math.min(imageSize.width, MAX_IMAGE_WIDTH);
      imageSize.height = imageSize.width * p;
      bounds.w = imageSize.width;
      bounds.h = imageSize.height;
    }
  }

  const others = bounds ? { xywh: bounds.serialize() } : undefined;

  const imageProp: Partial<ImageBlockProps> = {
    sourceId,
    caption: model.props.caption,
    size: model.props.size,
    ...imageSize,
    ...others,
  };
  transformModel(model, 'affine:image', imageProp);
}
