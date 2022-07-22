import type { FC, ReactNode } from 'react';

export const ContextMenu: FC<{ children: ReactNode }> = ({ children }) => {
    return <div>{children}</div>;
};
