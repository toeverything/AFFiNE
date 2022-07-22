import { forwardRef } from 'react';
import type { CSSProperties, ForwardedRef, ReactNode } from 'react';

interface Props {
    children: ReactNode;
    label?: string;
    style?: CSSProperties;
}

export const Container = forwardRef(
    ({ children, label, style }: Props, ref: ForwardedRef<HTMLDivElement>) => {
        return (
            <div ref={ref} style={style}>
                {label && <div>{label}</div>}
                {children}
            </div>
        );
    }
);
