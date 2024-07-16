import { OnEvent, Service } from '@toeverything/infra';

import { WorkbenchLocationChanged } from '../../workbench/services/workbench';
import { PeekViewEntity } from '../entities/peek-view';

@OnEvent(WorkbenchLocationChanged, e => () => e.peekView.close())
export class PeekViewService extends Service {
  public readonly peekView = this.framework.createEntity(PeekViewEntity);
}
