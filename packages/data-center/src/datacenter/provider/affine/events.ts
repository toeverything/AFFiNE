import { AccessTokenMessage } from './token';

export type Callback = (user: AccessTokenMessage | null) => void;

export class AuthorizationEvent {
  private callbacks: Callback[] = [];
  private lastState: AccessTokenMessage | null = null;

  /**
   * Callback will execute when call this function.
   */
  onChange(callback: Callback) {
    this.callbacks.push(callback);
    callback(this.lastState);
  }

  triggerChange(user: AccessTokenMessage | null) {
    this.lastState = user;
    this.callbacks.forEach(callback => callback(user));
  }

  removeCallback(callback: Callback) {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }
}
