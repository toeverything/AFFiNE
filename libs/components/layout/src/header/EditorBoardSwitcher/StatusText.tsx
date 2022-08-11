import { styled } from '@toeverything/components/ui';

type StatusTextProps = {
    children: string;
    width?: string;
    active?: boolean;
    onClick?: () => void;
};

export const StatusText = ({
    children,
    width,
    active,
    onClick,
}: StatusTextProps) => {
    return (
        <StyledText width={width} active={active} onClick={onClick}>
            {children}
        </StyledText>
    );
};

const StyledText = styled('div')<StatusTextProps>(
    ({ theme, width, active }) => {
        return {
            display: 'inline-flex',
            alignItems: 'center',
            color: active
                ? theme.affine.palette.primary
                : 'rgba(62, 111, 219, 0.6)',
            fontWeight: active ? '600' : '400',
            fontSize: '16px',
            lineHeight: '22px',
            cursor: 'pointer',
            ...(!!width && { width }),
        };
    }
);
