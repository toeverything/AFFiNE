import { Connection } from './connection';

export type SpaceType = 'workspace' | 'userspace';

export interface StorageOptions {
  type: SpaceType;
  id: string;
}

export abstract class Storage<
  Opts extends StorageOptions = StorageOptions,
> extends Connection {
  get spaceType() {
    return this.options.type;
  }

  get spaceId() {
    return this.options.id;
  }

  constructor(public readonly options: Opts) {
    super();
  }
}
