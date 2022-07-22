import { styled } from '@toeverything/components/ui';

type StatusTextProps = {
    children: string;
    active?: boolean;
    onClick?: () => void;
};

export const StatusText = ({ children, active, onClick }: StatusTextProps) => {
    return (
        <StyledText active={active} onClick={onClick}>
            {children}
        </StyledText>
    );
};

const StyledText = styled('div')<StatusTextProps>(({ theme, active }) => {
    return {
        display: 'inline-flex',
        alignItems: 'center',
        color: theme.affine.palette.primary,
        fontWeight: active ? '500' : '300',
        fontSize: '15px',
        cursor: 'pointer',
        padding: '0 6px',
    };
});
