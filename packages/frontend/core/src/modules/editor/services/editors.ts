import { Service } from '@toeverything/infra';

import { Editor } from '../entities/editor';

export class EditorsService extends Service {
  createEditor() {
    return this.framework.createEntity(Editor);
  }
}
