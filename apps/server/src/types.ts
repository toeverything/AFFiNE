import { Readable } from 'node:stream';

export interface FileUpload {
  filename: string;
  mimetype: string;
  encoding: string;
  createReadStream: () => Readable;
}
