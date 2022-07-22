import type { ReactNode } from 'react';
import { styled, ListItem, ListIcon } from '@toeverything/components/ui';

type TabItemTitleProps = {
    icon: ReactNode;
    title: string;
    isActive?: boolean;
    onClick?: () => void;
};

export const TabItemTitle = ({
    icon,
    title,
    isActive,
    onClick,
}: TabItemTitleProps) => {
    return (
        <Container active={isActive} onClick={onClick}>
            <IconWrapper>{icon}</IconWrapper>
            <StyledTitleText>{title}</StyledTitleText>
        </Container>
    );
};

const Container = styled(ListItem)({
    width: '110px',
    height: '32px',
});

const IconWrapper = styled(ListIcon)({
    marginRight: '4px',
});

const StyledTitleText = styled('span')(({ theme }) => {
    return {
        color: theme.affine.palette.menu,
    };
});
