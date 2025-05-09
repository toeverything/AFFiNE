import { type Container, createIdentifier } from '@blocksuite/global/di';
import { Extension } from '@blocksuite/store';

export interface IFileSizeLimitService {
  maxFileSize: number;
  onOverFileSize?: () => void;
}

export const FileSizeLimitProvider = createIdentifier<IFileSizeLimitService>(
  'FileSizeLimitService'
);

export class FileSizeLimitService
  extends Extension
  implements IFileSizeLimitService
{
  // 2GB
  maxFileSize = 2 * 1024 * 1024 * 1024;

  static override setup(di: Container) {
    di.addImpl(FileSizeLimitProvider, FileSizeLimitService);
  }
}
