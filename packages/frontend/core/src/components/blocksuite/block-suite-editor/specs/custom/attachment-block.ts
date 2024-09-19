import {
  BlockFlavourIdentifier,
  BlockServiceIdentifier,
  type ExtensionType,
  StdIdentifier,
} from '@blocksuite/affine/block-std';
import {
  AttachmentBlockService,
  AttachmentBlockSpec,
} from '@blocksuite/affine/blocks';
import bytes from 'bytes';

class CustomAttachmentBlockService extends AttachmentBlockService {
  override mounted(): void {
    // blocksuite default max file size is 10MB, we override it to 2GB
    // but the real place to limit blob size is CloudQuotaModal / LocalQuotaModal
    this.maxFileSize = bytes.parse('2GB');
    super.mounted();
  }
}

export const CustomAttachmentBlockSpec: ExtensionType[] = [
  ...AttachmentBlockSpec,
  {
    setup: di => {
      di.override(
        BlockServiceIdentifier('affine:attachment'),
        CustomAttachmentBlockService,
        [StdIdentifier, BlockFlavourIdentifier('affine:attachment')]
      );
    },
  },
];
