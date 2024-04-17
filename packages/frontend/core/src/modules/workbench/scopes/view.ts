import { Scope } from '@toeverything/infra';
import type { To } from 'history';

export class ViewScope extends Scope<{
  id: string;
  defaultLocation?: To | undefined;
}> {}
