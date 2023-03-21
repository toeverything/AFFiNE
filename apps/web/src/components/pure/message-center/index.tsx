import { toast } from '@affine/component';
import type { MessageCode } from '@affine/datacenter';
import { messages } from '@affine/datacenter';
import type React from 'react';
import { useEffect } from 'react';

declare global {
  interface DocumentEventMap {
    'affine-error': CustomEvent<{
      code: MessageCode;
    }>;
  }
}

export const MessageCenter: React.FC = () => {
  useEffect(() => {
    const listener = (
      event: CustomEvent<{
        code: MessageCode;
      }>
    ) => {
      toast(messages[event.detail.code].message);
    };

    document.addEventListener('affine-error', listener);
    return () => {
      document.removeEventListener('affine-error', listener);
    };
  }, []);
  return null;
};
