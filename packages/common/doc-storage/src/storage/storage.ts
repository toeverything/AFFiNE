import { Connection } from './connection';

export type SpaceType = 'workspace' | 'userspace';

export interface StorageOptions {
  type: SpaceType;
  id: string;
}

export class Storage<
  Opts extends StorageOptions = StorageOptions,
> extends Connection {
  public readonly options: Opts;

  get spaceType() {
    return this.options.type;
  }

  get spaceId() {
    return this.options.id;
  }

  constructor(options: Opts) {
    super();
    this.options = options;
  }
}
