import { toast } from '@affine/component';
import type { MessageCode } from '@affine/env/constant';
import { Messages } from '@affine/env/constant';
import { useEffect } from 'react';

type Callback = (code: MessageCode) => void;

const messageCenter = {
  callbacks: new Set<Callback>(),
};

export function dispatchMessage(message: number) {
  messageCenter.callbacks.forEach(callback => {
    callback(message);
  });
}

export function onMessage(callback: Callback): () => void {
  return () => {
    messageCenter.callbacks.delete(callback);
  };
}

export function MessageCenter() {
  useEffect(() => {
    const dispose = onMessage(code => {
      toast(Messages[code].message);
    });

    return () => {
      dispose();
    };
  }, []);
  return null;
}
