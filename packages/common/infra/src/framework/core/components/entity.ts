import { Component } from './component';

// eslint-disable-next-line @typescript-eslint/ban-types
export class Entity<Props = {}> extends Component<Props> {
  readonly __isEntity = true;
}
