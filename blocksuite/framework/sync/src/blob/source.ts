import type { Observable } from 'rxjs';

export interface BlobState {
  uploading: boolean;
  downloading: boolean;
  errorMessage?: string | null;
  overSize: boolean;
  needUpload: boolean;
  needDownload: boolean;
}

export interface BlobSource {
  name: string;
  readonly: boolean;
  get: (key: string) => Promise<Blob | null>;
  set: (key: string, value: Blob) => Promise<string>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
  // This state is only available when uploading to the server or downloading from the server.
  blobState$?: (key: string) => Observable<BlobState> | null;
  // Re-upload to the server.
  upload?: (key: string) => Promise<boolean>;
}
