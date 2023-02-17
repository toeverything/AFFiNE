import { Observable } from 'lib0/observable';
import { Message } from '../types';
import { MessageCode, messages } from './code';

export class MessageCenter extends Observable<string> {
  private _messages: Record<number, Omit<Message, 'provider' | 'code'>> =
    messages;
  constructor() {
    super();
  }

  static instance: MessageCenter;

  static getInstance() {
    if (!MessageCenter.instance) {
      MessageCenter.instance = new MessageCenter();
    }
    return MessageCenter.instance;
  }

  static messageCode = MessageCode;

  public getMessageSender(provider: string) {
    return this._send.bind(this, provider);
  }

  private _send(provider: string, messageCode: MessageCode) {
    this.emit('message', [
      { ...this._messages[messageCode], provider, code: messageCode },
    ]);
  }

  public onMessage(callback: (message: Message) => void) {
    this.on('message', callback);
  }
}
