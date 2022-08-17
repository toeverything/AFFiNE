import type {
    CSSProperties,
    MouseEventHandler,
    PropsWithChildren,
} from 'react';
import { styled } from '../styled';

/* Temporary solution, needs to be adjusted */
const SIZE_SMALL = 'small' as const;
const SIZE_MIDDLE = 'middle' as const;
const SIZE_LARGE = 'large' as const;

const SIZE_CONFIG = {
    [SIZE_SMALL]: {
        iconSize: '14px',
        areaSize: '20px',
    },
    [SIZE_MIDDLE]: {
        iconSize: '20px',
        areaSize: '32px',
    },
    [SIZE_LARGE]: {
        iconSize: '24px',
        areaSize: '36px',
    },
} as const;

type SizeType = keyof typeof SIZE_CONFIG;

type IconButtonContainerProps = {
    size?: SizeType;
    hoverColor?: CSSProperties['backgroundColor'];
    backgroundColor?: CSSProperties['backgroundColor'];
    disabled?: boolean;
};

interface IconButtonProps extends IconButtonContainerProps {
    onClick?: MouseEventHandler;
    disabled?: boolean;
    style?: CSSProperties;
    className?: string;
}

export const IconButton = ({
    children,
    disabled,
    onClick,
    className,
    ...props
}: PropsWithChildren<IconButtonProps>) => {
    return (
        <Container
            {...props}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
        >
            {children}
        </Container>
    );
};

const Container = styled('button')<IconButtonContainerProps>(
    ({ theme, size = SIZE_MIDDLE, hoverColor, backgroundColor, disabled }) => {
        const { iconSize, areaSize } = SIZE_CONFIG[size];

        return {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: areaSize,
            height: areaSize,
            backgroundColor: backgroundColor ?? 'transparent',
            color: theme.affine.palette.icons,
            padding: theme.affine.spacing.iconPadding,
            borderRadius: '3px',

            '& svg': {
                width: iconSize,
                height: iconSize,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
            },

            '&:hover': {
                backgroundColor: hoverColor || theme.affine.palette.hover,
            },

            ...(disabled ? { cursor: 'not-allowed' } : {}),
        };
    }
);
