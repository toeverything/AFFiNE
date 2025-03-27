import {
  type ClipboardConfigCreationContext,
  EdgelessClipboardConfig,
} from '@blocksuite/affine-block-surface';
import { ReferenceInfoSchema } from '@blocksuite/affine-model';
import { type BlockSnapshot, fromJSON } from '@blocksuite/store';

export class EdgelessClipboardNoteConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:note';

  override async createBlock(note: BlockSnapshot): Promise<null | string> {
    const oldId = note.id;

    delete note.props.index;
    if (!note.props.xywh) {
      console.error(`Note block(id: ${oldId}) does not have xywh property`);
      return null;
    }

    const newId = await this.onBlockSnapshotPaste(
      note,
      this.std.store,
      this.std.store.root!.id
    );
    if (!newId) {
      console.error(`Failed to paste note block(id: ${oldId})`);
      return null;
    }

    return newId;
  }
}

export class EdgelessClipboardEdgelessTextConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:edgeless-text';

  override async createBlock(
    edgelessText: BlockSnapshot
  ): Promise<string | null> {
    const oldId = edgelessText.id;
    delete edgelessText.props.index;
    if (!edgelessText.props.xywh) {
      console.error(
        `EdgelessText block(id: ${oldId}) does not have xywh property`
      );
      return null;
    }
    if (!this.surface) {
      return null;
    }
    const newId = await this.onBlockSnapshotPaste(
      edgelessText,
      this.std.store,
      this.surface.model.id
    );
    if (!newId) {
      console.error(`Failed to paste EdgelessText block(id: ${oldId})`);
      return null;
    }

    return newId;
  }
}

export class EdgelessClipboardImageConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:image';

  override async createBlock(image: BlockSnapshot) {
    const { xywh, rotate, sourceId, size, width, height, caption } =
      image.props;

    if (!this.surface) return null;

    if (!(await this.std.workspace.blobSync.get(sourceId as string))) {
      return null;
    }
    return this.crud.addBlock(
      'affine:image',
      {
        caption,
        sourceId,
        xywh,
        rotate,
        size,
        width,
        height,
      },
      this.surface.model.id
    );
  }
}

export class EdgelessClipboardFrameConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:frame';

  override createBlock(
    frame: BlockSnapshot,
    context: ClipboardConfigCreationContext
  ): string | null {
    if (!this.surface) return null;

    const { oldToNewIdMap, newPresentationIndexes } = context;
    const { xywh, title, background, childElementIds } = frame.props;

    const newChildElementIds: Record<string, boolean> = {};

    if (typeof childElementIds === 'object' && childElementIds !== null) {
      Object.keys(childElementIds).forEach(oldId => {
        const newId = oldToNewIdMap.get(oldId);
        if (newId) {
          newChildElementIds[newId] = true;
        }
      });
    }

    const frameId = this.crud.addBlock(
      'affine:frame',
      {
        xywh,
        background,
        title: fromJSON(title),
        childElementIds: newChildElementIds,
        presentationIndex: newPresentationIndexes.get(frame.id),
      },
      this.surface.model.id
    );
    return frameId;
  }
}

export class EdgelessClipboardAttachmentConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:attachment';

  override async createBlock(
    attachment: BlockSnapshot
  ): Promise<string | null> {
    if (!this.surface) return null;

    const { xywh, rotate, sourceId, name, size, type, embed, style } =
      attachment.props;

    if (!(await this.std.workspace.blobSync.get(sourceId as string))) {
      return null;
    }
    const attachmentId = this.crud.addBlock(
      'affine:attachment',
      {
        xywh,
        rotate,
        sourceId,
        name,
        size,
        type,
        embed,
        style,
      },
      this.surface.model.id
    );
    return attachmentId;
  }
}

export class EdgelessClipboardBookmarkConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:bookmark';

  override createBlock(bookmark: BlockSnapshot): string | null {
    if (!this.surface) return null;

    const { xywh, style, url, caption, description, icon, image, title } =
      bookmark.props;

    const bookmarkId = this.crud.addBlock(
      'affine:bookmark',
      {
        xywh,
        style,
        url,
        caption,
        description,
        icon,
        image,
        title,
      },
      this.surface.model.id
    );
    return bookmarkId;
  }
}

export class EdgelessClipboardEmbedFigmaConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:embed-figma';

  override createBlock(figmaEmbed: BlockSnapshot): string | null {
    if (!this.surface) return null;
    const { xywh, style, url, caption, title, description } = figmaEmbed.props;

    const embedFigmaId = this.crud.addBlock(
      'affine:embed-figma',
      {
        xywh,
        style,
        url,
        caption,
        title,
        description,
      },
      this.surface.model.id
    );
    return embedFigmaId;
  }
}

export class EdgelessClipboardEmbedGithubConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:embed-github';

  override createBlock(githubEmbed: BlockSnapshot): string | null {
    if (!this.surface) return null;

    const {
      xywh,
      style,
      owner,
      repo,
      githubType,
      githubId,
      url,
      caption,
      image,
      status,
      statusReason,
      title,
      description,
      createdAt,
      assignees,
    } = githubEmbed.props;

    const embedGithubId = this.crud.addBlock(
      'affine:embed-github',
      {
        xywh,
        style,
        owner,
        repo,
        githubType,
        githubId,
        url,
        caption,
        image,
        status,
        statusReason,
        title,
        description,
        createdAt,
        assignees,
      },
      this.surface.model.id
    );
    return embedGithubId;
  }
}

export class EdgelessClipboardEmbedHtmlConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:embed-html';

  override createBlock(htmlEmbed: BlockSnapshot): string | null {
    if (!this.surface) return null;
    const { xywh, style, caption, html, design } = htmlEmbed.props;

    const embedHtmlId = this.crud.addBlock(
      'affine:embed-html',
      {
        xywh,
        style,
        caption,
        html,
        design,
      },
      this.surface.model.id
    );
    return embedHtmlId;
  }
}

export class EdgelessClipboardEmbedLoomConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:embed-loom';

  override createBlock(loomEmbed: BlockSnapshot): string | null {
    if (!this.surface) return null;
    const { xywh, style, url, caption, videoId, image, title, description } =
      loomEmbed.props;

    const embedLoomId = this.crud.addBlock(
      'affine:embed-loom',
      {
        xywh,
        style,
        url,
        caption,
        videoId,
        image,
        title,
        description,
      },
      this.surface.model.id
    );
    return embedLoomId;
  }
}

export class EdgelessClipboardEmbedYoutubeConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:embed-youtube';

  override createBlock(youtubeEmbed: BlockSnapshot): string | null {
    if (!this.surface) return null;
    const {
      xywh,
      style,
      url,
      caption,
      videoId,
      image,
      title,
      description,
      creator,
      creatorUrl,
      creatorImage,
    } = youtubeEmbed.props;

    const embedYoutubeId = this.crud.addBlock(
      'affine:embed-youtube',
      {
        xywh,
        style,
        url,
        caption,
        videoId,
        image,
        title,
        description,
        creator,
        creatorUrl,
        creatorImage,
      },
      this.surface.model.id
    );
    return embedYoutubeId;
  }
}

export class EdgelessClipboardEmbedIframeConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:embed-iframe';

  override createBlock(embedIframe: BlockSnapshot): string | null {
    if (!this.surface) return null;
    const {
      xywh,
      caption,
      url,
      title,
      description,
      iframeUrl,
      scale,
      width,
      height,
    } = embedIframe.props;

    return this.crud.addBlock(
      'affine:embed-iframe',
      {
        url,
        iframeUrl,
        xywh,
        caption,
        title,
        description,
        scale,
        width,
        height,
      },
      this.surface.model.id
    );
  }
}

export class EdgelessClipboardEmbedLinkedDocConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:embed-linked-doc';

  override createBlock(linkedDocEmbed: BlockSnapshot): string | null {
    if (!this.surface) return null;

    const { xywh, style, caption, pageId, params, title, description } =
      linkedDocEmbed.props;
    const referenceInfo = ReferenceInfoSchema.parse({
      pageId,
      params,
      title,
      description,
    });

    return this.crud.addBlock(
      'affine:embed-linked-doc',
      {
        xywh,
        style,
        caption,
        ...referenceInfo,
      },
      this.surface.model.id
    );
  }
}

export class EdgelessClipboardEmbedSyncedDocConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:embed-synced-doc';

  override createBlock(syncedDocEmbed: BlockSnapshot): string | null {
    if (!this.surface) return null;

    const { xywh, style, caption, scale, pageId, params } =
      syncedDocEmbed.props;
    const referenceInfo = ReferenceInfoSchema.parse({ pageId, params });

    return this.crud.addBlock(
      'affine:embed-synced-doc',
      {
        xywh,
        style,
        caption,
        scale,
        ...referenceInfo,
      },
      this.surface.model.id
    );
  }
}
