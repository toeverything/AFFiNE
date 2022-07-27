import { styled } from '@toeverything/components/ui';
import type { ComponentPropsWithRef, MouseEvent } from 'react';
import { forwardRef } from 'react';

const StyledPanel = styled('div')(() => ({
    position: 'absolute',
    top: 50,
    background: '#FFFFFF',
    boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
    borderRadius: 10,
    padding: '12px 24px',
}));

const Panel = forwardRef<HTMLDivElement, ComponentPropsWithRef<'div'>>(
    ({ onClick, ...rest }, ref) => {
        const stopPropagation = (e: MouseEvent<HTMLDivElement>) => {
            onClick?.(e);
            e.stopPropagation();
        };

        return <StyledPanel ref={ref} onClick={stopPropagation} {...rest} />;
    }
);

export { Panel };
