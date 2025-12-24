/**
 * Represents an imported file entry in the zip archive
 */
export type ImportedFileEntry = {
  /** The filename of the file (e.g. "document.md", "document.html") */
  filename: string;
  /** The blob containing the file content */
  contentBlob: Blob;
  /** The full path of the file in the zip archive */
  fullPath: string;
};

/**
 * Map of asset hash to File object for all media files in the zip
 * Key: SHA hash of the file content (blobId)
 * Value: File object containing the actual media data
 */
export type AssetMap = Map<string, File>;

/**
 * Map of file paths to their corresponding asset hashes
 * Key: Original file path in the zip
 * Value: SHA hash of the file content (blobId)
 */
export type PathBlobIdMap = Map<string, string>;
