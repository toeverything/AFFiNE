import {
  AttachmentService,
  EdgelessPreset,
  PagePreset,
} from '@blocksuite/blocks';
import bytes from 'bytes';

class CustomAttachmentService extends AttachmentService {
  override mounted(): void {
    //TODO: get user type from store
    const userType = 'pro';
    if (userType === 'pro') {
      this.maxFileSize = bytes.parse('100MB');
    } else {
      this.maxFileSize = bytes.parse('10MB');
    }
  }
}

export function getPresets() {
  const pageModePreset = PagePreset.map(preset => {
    if (preset.schema.model.flavour === 'affine:attachment') {
      return {
        ...preset,
        service: CustomAttachmentService,
      };
    }
    return preset;
  });
  const edgelessModePreset = EdgelessPreset.map(preset => {
    if (preset.schema.model.flavour === 'affine:attachment') {
      return {
        ...preset,
        service: CustomAttachmentService,
      };
    }
    return preset;
  });

  return {
    pageModePreset,
    edgelessModePreset,
  };
}
