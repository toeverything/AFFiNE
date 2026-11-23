import type { ReactToLit } from '@affine/component';
import { AttachmentEmbedPreview } from '@affine/core/blocksuite/attachment-viewer/attachment-embed-preview';
import { AttachmentEmbedConfigIdentifier } from '@blocksuite/affine/blocks/attachment';
import type { ExtensionType } from '@blocksuite/store';

export function patchForAudioEmbedView(reactToLit: ReactToLit): ExtensionType {
  return {
    setup: di => {
      // do not show audio block on mobile
      if (BUILD_CONFIG.isMobileEdition) {
        return;
      }
      di.override(AttachmentEmbedConfigIdentifier('audio'), () => ({
        name: 'audio',
        check: (model, maxFileSize) =>
          model.props.type.startsWith('audio/') &&
          model.props.size <= maxFileSize,
        render: (model, _) =>
          reactToLit(<AttachmentEmbedPreview model={model} />, false),
      }));
    },
  };
}
