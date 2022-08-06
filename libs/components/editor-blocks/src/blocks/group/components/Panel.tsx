import { styled } from '@toeverything/components/ui';
import type { ComponentPropsWithRef, MouseEvent } from 'react';
import { forwardRef } from 'react';

const StyledPanel = styled('div')(({ theme }) => ({
    position: 'absolute',
    top: 50,
    background: '#FFFFFF',
    boxShadow: theme.affine.shadows.shadow1,
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
