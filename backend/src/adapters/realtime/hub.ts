import type { Server } from 'socket.io';

import type { RealtimeHub } from '../../domain/ports.js';
import { realtimeInputKey, realtimeRoom } from './rooms.js';

export class SocketRealtimeHub implements RealtimeHub {
  constructor(private readonly getIo: () => Server | undefined) {}

  emit(topic: string, input: Record<string, unknown>, event: unknown): void {
    const io = this.getIo();
    if (!io) {
      return;
    }
    const inputKey = realtimeInputKey(input);
    io.to(realtimeRoom(topic, inputKey)).emit('realtime:event', {
      topic,
      inputKey,
      sentAt: Date.now(),
      event,
    });
  }
}
