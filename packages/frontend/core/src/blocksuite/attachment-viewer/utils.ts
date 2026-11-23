import type { AttachmentBlockModel } from '@blocksuite/affine/model';
import { filesize } from 'filesize';

import { downloadBlob } from '../../utils/resource';
import type { AttachmentViewerBaseProps } from './types';

export async function getAttachmentBlob(model: AttachmentBlockModel) {
  const sourceId = model.props.sourceId;
  if (!sourceId) {
    return null;
  }

  const doc = model.store;
  let blob = await doc.blobSync.get(sourceId);

  if (blob) {
    blob = new Blob([blob], { type: model.props.type });
  }

  return blob;
}

export async function download(model: AttachmentBlockModel) {
  const blob = await getAttachmentBlob(model);
  if (!blob) return;

  await downloadBlob(blob, model.props.name);
}

export function buildAttachmentProps(
  model: AttachmentBlockModel
): AttachmentViewerBaseProps {
  const pieces = model.props.name.split('.');
  const ext = pieces.pop() || '';
  const name = pieces.join('.');
  const size = filesize(model.props.size);
  return { model, name, ext, size };
}

export { getAttachmentType } from '@affine/core/modules/media/utils';
