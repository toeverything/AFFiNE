import { Component } from './component';

export class Service extends Component {
  readonly __isService = true;
  readonly __injectable = true;
}
