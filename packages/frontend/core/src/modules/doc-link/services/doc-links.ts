import { Service } from '@toeverything/infra';

import { DocBacklinks } from '../entities/doc-backlinks';
import { DocLinks } from '../entities/doc-links';

export class DocLinksService extends Service {
  backlinks = this.framework.createEntity(DocBacklinks);
  links = this.framework.createEntity(DocLinks);
}
