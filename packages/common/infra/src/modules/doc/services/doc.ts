import { Service } from '../../../framework';
import { Doc } from '../entities/doc';

export class DocService extends Service {
  public readonly doc = this.framework.createEntity(Doc);
}
