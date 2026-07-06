export type WebImportLimits = {
  maxTotalBytes: number;
  maxEntryBytes: number;
  maxEntryCount: number;
  maxNestedZipDepth: number;
  maxDocumentCount: number;
};

export const webImportLimits: WebImportLimits = {
  maxTotalBytes: 32 * 1024 * 1024,
  maxEntryBytes: 8 * 1024 * 1024,
  maxEntryCount: 1000,
  maxNestedZipDepth: 0,
  maxDocumentCount: 250,
};

export class WebImportLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebImportLimitError';
  }
}

export async function preflightWebZipImport(
  file: File,
  limits = webImportLimits
) {
  if (file.size > limits.maxTotalBytes) {
    throw new WebImportLimitError(
      'This import is too large for the web app. Please import it in the desktop client.'
    );
  }

  const entries = readZipDirectory(new Uint8Array(await file.arrayBuffer()));
  if (entries.length > limits.maxEntryCount) {
    throw new WebImportLimitError(
      'This import has too many files for the web app. Please import it in the desktop client.'
    );
  }

  const documentCount = entries.filter(entry =>
    isWebImportDocument(entry.name)
  ).length;
  if (documentCount > limits.maxDocumentCount) {
    throw new WebImportLimitError(
      'This import has too many documents for the web app. Please import it in the desktop client.'
    );
  }

  for (const entry of entries) {
    if (entry.uncompressedSize > limits.maxEntryBytes) {
      throw new WebImportLimitError(
        'This import contains a file that is too large for the web app. Please import it in the desktop client.'
      );
    }
    if (
      limits.maxNestedZipDepth === 0 &&
      entry.name.toLowerCase().endsWith('.zip')
    ) {
      throw new WebImportLimitError(
        'This import contains a nested zip. Please import it in the desktop client.'
      );
    }
  }
}

export async function preflightWebFilesImport(
  files: File[],
  limits = webImportLimits
) {
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > limits.maxTotalBytes) {
    throw new WebImportLimitError(
      'This import is too large for the web app. Please import it in the desktop client.'
    );
  }
  if (files.length > limits.maxEntryCount) {
    throw new WebImportLimitError(
      'This import has too many files for the web app. Please import it in the desktop client.'
    );
  }

  let documentCount = 0;
  for (const file of files) {
    if (file.size > limits.maxEntryBytes) {
      throw new WebImportLimitError(
        'This import contains a file that is too large for the web app. Please import it in the desktop client.'
      );
    }
    const path = file.webkitRelativePath || file.name;
    if (path.toLowerCase().endsWith('.zip')) {
      throw new WebImportLimitError(
        'This import contains a nested zip. Please import it in the desktop client.'
      );
    }
    if (isWebImportDocument(path)) {
      documentCount += 1;
    }
  }
  if (documentCount > limits.maxDocumentCount) {
    throw new WebImportLimitError(
      'This import has too many documents for the web app. Please import it in the desktop client.'
    );
  }
}

function isWebImportDocument(path: string) {
  const lower = path.toLowerCase();
  return (
    lower.endsWith('.md') || lower.endsWith('.html') || lower.endsWith('.htm')
  );
}

type ZipEntry = {
  name: string;
  uncompressedSize: number;
};

function readZipDirectory(bytes: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  for (let offset = 0; offset + 46 <= bytes.length; offset++) {
    if (readU32(bytes, offset) !== 0x02014b50) continue;

    const compressedSize = readU32(bytes, offset + 20);
    const uncompressedSize = readU32(bytes, offset + 24);
    const fileNameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd > bytes.length) break;

    entries.push({
      name: new TextDecoder().decode(bytes.subarray(nameStart, nameEnd)),
      uncompressedSize: uncompressedSize || compressedSize,
    });
    offset = nameEnd + extraLength + commentLength - 1;
  }

  return entries;
}

function readU16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}
