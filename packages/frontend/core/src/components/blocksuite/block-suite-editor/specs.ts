import {
  AttachmentService,
  DocEditorBlockSpecs,
  EdgelessEditorBlockSpecs,
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

export const docModeSpecs = DocEditorBlockSpecs.map(spec => {
  if (spec.schema.model.flavour === 'affine:attachment') {
    return {
      ...spec,
      service: CustomAttachmentService,
    };
  }
  return spec;
});
export const edgelessModeSpecs = EdgelessEditorBlockSpecs.map(spec => {
  if (spec.schema.model.flavour === 'affine:attachment') {
    return {
      ...spec,
      service: CustomAttachmentService,
    };
  }
  return spec;
});
