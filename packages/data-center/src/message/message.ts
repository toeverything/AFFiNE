import { Observable } from 'lib0/observable';
import { Message } from '../types';
import { MessageCode } from './code';

export class MessageCenter extends Observable<string> {
  constructor() {
    super();
  }

  public send(message: MessageCode) {
    this.emit('message', [message]);
  }

  public onMessage(callback: (message: Message) => void) {
    this.on('message', callback);
  }

  private messages: Record<number, Message> = {
    [MessageCode.loginError]: {
      code: MessageCode.loginError,
      message: 'Login failed',
    },
  };
}
