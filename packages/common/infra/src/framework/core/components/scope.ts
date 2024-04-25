import { Component } from './component';

// eslint-disable-next-line @typescript-eslint/ban-types
export class Scope<Props = {}> extends Component<Props> {
  readonly __injectable = true;

  get collection() {
    return this.framework.collection;
  }

  get scope() {
    return this.framework.scope;
  }

  get get() {
    return this.framework.get;
  }

  get getAll() {
    return this.framework.getAll;
  }

  get getOptional() {
    return this.framework.getOptional;
  }

  get createEntity() {
    return this.framework.createEntity;
  }

  get createScope() {
    return this.framework.createScope;
  }

  get emitEvent() {
    return this.framework.emitEvent;
  }

  override dispose(): void {
    super.dispose();
    this.framework.dispose();
  }
}
