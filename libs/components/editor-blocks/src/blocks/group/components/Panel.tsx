import { styled } from '@toeverything/components/ui';
import type { ReactNode, MouseEvent, CSSProperties } from 'react';

const StyledPanel = styled('div')<{ extraStyle?: CSSProperties }>(
    ({ extraStyle }) => ({
        position: 'absolute',
        top: 50,
        background: '#FFFFFF',
        boxShadow: '0px 1px 10px rgba(152, 172, 189, 0.6)',
        borderRadius: 10,
        padding: '12px 24px',
        ...extraStyle,
    })
);

const Panel = ({
    children,
    extraStyle,
}: {
    children: ReactNode;
    extraStyle?: CSSProperties;
}) => {
    const stopPropagation = (e: MouseEvent<HTMLDivElement>) =>
        e.stopPropagation();

    return (
        <StyledPanel style={extraStyle} onClick={stopPropagation}>
            {children}
        </StyledPanel>
    );
};

export { Panel };
