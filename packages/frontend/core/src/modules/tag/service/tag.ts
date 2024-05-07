import { Service } from '@toeverything/infra';

import { TagList } from '../entities/tag-list';

export class TagService extends Service {
  tagList = this.framework.createEntity(TagList);
}
