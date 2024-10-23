import { fileTypeFromBuffer } from 'file-type';

async function _saveBufferToFile(url: string, filename: string) {
  // given input url may not have correct mime type
  const blob = await attachmentUrlToBlob(url);
  if (!blob) {
    return;
  }

  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

async function attachmentUrlToBlob(url: string): Promise<Blob | undefined> {
  const buffer = await fetch(url).then(response => {
    return response.arrayBuffer();
  });

  if (!buffer) {
    console.warn('Could not get blob');
    return;
  }
  try {
    const type = await fileTypeFromBuffer(buffer);
    if (!type) {
      return;
    }
    const blob = new Blob([buffer], { type: type.mime });
    return blob;
  } catch (error) {
    console.error('Error converting attachment to blob', error);
  }
  return;
}
