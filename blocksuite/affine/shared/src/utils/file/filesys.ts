// Polyfill for `showOpenFilePicker` API
// See https://github.com/DefinitelyTyped/DefinitelyTyped/blob/master/types/wicg-file-system-access/index.d.ts
// See also https://caniuse.com/?search=showOpenFilePicker
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';

interface OpenFilePickerOptions {
  types?:
    | {
        description?: string | undefined;
        accept: Record<string, string | string[]>;
      }[]
    | undefined;
  excludeAcceptAllOption?: boolean | undefined;
  multiple?: boolean | undefined;
}

declare global {
  interface Window {
    // Window API: showOpenFilePicker
    showOpenFilePicker?: (
      options?: OpenFilePickerOptions
    ) => Promise<FileSystemFileHandle[]>;
  }
}

// See [Common MIME types](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types)
const FileTypes: NonNullable<OpenFilePickerOptions['types']> = [
  {
    description: 'Images',
    accept: {
      'image/*': [
        '.avif',
        '.gif',
        // '.ico',
        '.jpeg',
        '.jpg',
        '.png',
        '.tif',
        '.tiff',
        // '.svg',
        '.webp',
      ],
    },
  },
  {
    description: 'Videos',
    accept: {
      'video/*': [
        '.avi',
        '.mp4',
        '.mpeg',
        '.ogg',
        // '.ts',
        '.webm',
        '.3gp',
        '.3g2',
      ],
    },
  },
  {
    description: 'Audios',
    accept: {
      'audio/*': [
        '.aac',
        '.mid',
        '.midi',
        '.mp3',
        '.oga',
        '.opus',
        '.wav',
        '.weba',
        '.3gp',
        '.3g2',
      ],
    },
  },
  {
    description: 'Markdown',
    accept: {
      'text/markdown': ['.md', '.markdown'],
    },
  },
  {
    description: 'Html',
    accept: {
      'text/html': ['.html', '.htm'],
    },
  },
  {
    description: 'Zip',
    accept: {
      'application/zip': ['.zip'],
    },
  },
  {
    description: 'Docx',
    accept: {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['.docx'],
    },
  },
  {
    description: 'MindMap',
    accept: {
      'text/xml': ['.mm', '.opml', '.xml'],
    },
  },
];

/**
 * See https://web.dev/patterns/files/open-one-or-multiple-files/
 */
type AcceptTypes =
  | 'Any'
  | 'Images'
  | 'Videos'
  | 'Audios'
  | 'Markdown'
  | 'Html'
  | 'Zip'
  | 'Docx'
  | 'MindMap';

export async function openFilesWith(
  acceptType: AcceptTypes = 'Any',
  multiple: boolean = true
): Promise<File[] | null> {
  // Feature detection. The API needs to be supported
  // and the app not run in an iframe.
  const supportsFileSystemAccess =
    'showOpenFilePicker' in window &&
    (() => {
      try {
        return window.self === window.top;
      } catch {
        return false;
      }
    })();

  // If the File System Access API is supported…
  if (supportsFileSystemAccess && window.showOpenFilePicker) {
    try {
      const fileType = FileTypes.find(i => i.description === acceptType);
      if (acceptType !== 'Any' && !fileType)
        throw new BlockSuiteError(
          ErrorCode.DefaultRuntimeError,
          `Unexpected acceptType "${acceptType}"`
        );
      const pickerOpts = {
        types: fileType ? [fileType] : undefined,
        multiple,
      } satisfies OpenFilePickerOptions;
      // Show the file picker, optionally allowing multiple files.
      const handles = await window.showOpenFilePicker(pickerOpts);

      return await Promise.all(handles.map(handle => handle.getFile()));
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  // Fallback if the File System Access API is not supported.
  return new Promise(resolve => {
    // Append a new `<input type="file" multiple? />` and hide it.
    const input = document.createElement('input');
    input.classList.add('affine-upload-input');
    input.style.display = 'none';
    input.type = 'file';
    input.multiple = multiple;

    if (acceptType !== 'Any') {
      // For example, `accept="image/*"` or `accept="video/*,audio/*"`.
      input.accept = Object.keys(
        FileTypes.find(i => i.description === acceptType)?.accept ?? ''
      ).join(',');
    }
    document.body.append(input);
    // The `change` event fires when the user interacts with the dialog.
    input.addEventListener('change', () => {
      // Remove the `<input type="file" multiple? />` again from the DOM.
      input.remove();

      resolve(input.files ? Array.from(input.files) : null);
    });
    // The `cancel` event fires when the user cancels the dialog.
    input.addEventListener('cancel', () => resolve(null));
    // Show the picker.
    if ('showPicker' in HTMLInputElement.prototype) {
      input.showPicker();
    } else {
      input.click();
    }
  });
}

export async function openSingleFileWith(
  acceptType?: AcceptTypes
): Promise<File | null> {
  const files = await openFilesWith(acceptType, false);
  return files?.at(0) ?? null;
}

export async function getImageFilesFromLocal() {
  const files = await openFilesWith('Images');
  return files ?? [];
}

export function downloadBlob(blob: Blob, name: string) {
  const dataURL = URL.createObjectURL(blob);
  const tmpLink = document.createElement('a');
  const event = new MouseEvent('click');
  tmpLink.download = name;
  tmpLink.href = dataURL;
  tmpLink.dispatchEvent(event);

  tmpLink.remove();
  URL.revokeObjectURL(dataURL);
}

// Use lru strategy is a better choice, but it's just a temporary solution.
const MAX_TEMP_DATA_SIZE = 100;
/**
 * TODO @Saul-Mirone use some other way to store the temp data
 *
 * @deprecated Waiting for migration
 */
const tempAttachmentMap = new Map<
  string,
  {
    // name for the attachment
    name: string;
  }
>();
const tempImageMap = new Map<
  string,
  {
    // This information comes from pictures.
    // If the user switches between pictures and attachments,
    // this information should be retained.
    width: number | undefined;
    height: number | undefined;
  }
>();

/**
 * Because the image block and attachment block have different props.
 * We need to save some data temporarily when converting between them to ensure no data is lost.
 *
 * For example, before converting from an image block to an attachment block,
 * we need to save the image's width and height.
 *
 * Similarly, when converting from an attachment block to an image block,
 * we need to save the attachment's name.
 *
 * See also https://github.com/toeverything/blocksuite/pull/4583#pullrequestreview-1610662677
 *
 * @internal
 */
export function withTempBlobData() {
  const saveAttachmentData = (sourceId: string, data: { name: string }) => {
    if (tempAttachmentMap.size > MAX_TEMP_DATA_SIZE) {
      console.warn(
        'Clear the temp attachment data. It may cause filename loss when converting between image and attachment.'
      );
      tempAttachmentMap.clear();
    }

    tempAttachmentMap.set(sourceId, data);
  };
  const getAttachmentData = (blockId: string) => {
    const data = tempAttachmentMap.get(blockId);
    tempAttachmentMap.delete(blockId);
    return data;
  };

  const saveImageData = (
    sourceId: string,
    data: { width: number | undefined; height: number | undefined }
  ) => {
    if (tempImageMap.size > MAX_TEMP_DATA_SIZE) {
      console.warn(
        'Clear temp image data. It may cause image width and height loss when converting between image and attachment.'
      );
      tempImageMap.clear();
    }

    tempImageMap.set(sourceId, data);
  };
  const getImageData = (blockId: string) => {
    const data = tempImageMap.get(blockId);
    tempImageMap.delete(blockId);
    return data;
  };
  return {
    saveAttachmentData,
    getAttachmentData,
    saveImageData,
    getImageData,
  };
}
