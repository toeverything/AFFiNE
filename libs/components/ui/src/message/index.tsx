import type { ReactNode } from 'react';

import { show } from './base';
import { Success } from './success';

interface SuccessProps {
    /**
     * 自动关闭延时，单位毫秒。默认2000
     */
    duration?: number;
    content: ReactNode;
}

export const message = {
    success({ duration, content }: SuccessProps) {
        return show({ Container: Success, duration, content });
    },
};
