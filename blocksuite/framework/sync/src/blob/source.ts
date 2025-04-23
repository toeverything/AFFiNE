export interface BlobSource {
  name: string;
  readonly: boolean;
  maxFileSize?: number;
  get: (key: string) => Promise<Blob | null>;
  set: (key: string, value: Blob) => Promise<string>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
}
