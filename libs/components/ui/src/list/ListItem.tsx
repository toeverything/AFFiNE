import type { FC, PropsWithChildren, CSSProperties } from 'react';
import { Clickable } from '../clickable';
import { styled } from '../styled';

interface ListItemProps {
    active?: boolean;
    onClick?: () => void;
    className?: string;
    style?: CSSProperties;
}

export const ListItem: FC<PropsWithChildren<ListItemProps>> = ({
    active,
    children,
    onClick,
    className,
    style,
}) => {
    return (
        <Container
            active={active}
            onClick={onClick}
            className={className}
            style={style}
        >
            {children}
        </Container>
    );
};

const Container = styled(Clickable)({
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
});
