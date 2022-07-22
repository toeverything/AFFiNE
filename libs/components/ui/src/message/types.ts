import type { ReactNode } from 'react';

export interface ContainerProps {
    content: ReactNode;
    duration: number;
    close: () => void;
}
