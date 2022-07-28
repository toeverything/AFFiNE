import type {
    FC,
    MouseEventHandler,
    CSSProperties,
    PropsWithChildren,
} from 'react';
import { styled } from '../styled';
import { buttonStatus } from './constants';
import { cx } from '../clsx';

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

interface IconButtonProps {
    onClick?: MouseEventHandler;
    disabled?: boolean;
    style?: CSSProperties;
    className?: string;
    size?: SizeType;
}

export const IconButton: FC<PropsWithChildren<IconButtonProps>> = ({
    children,
    disabled,
    onClick,
    className,
    ...props
}) => {
    return (
        <Container
            {...props}
            onClick={disabled ? undefined : onClick}
            disabled={disabled}
            className={cx({ [buttonStatus.disabled]: disabled }, className)}
        >
            {children}
        </Container>
    );
};

const Container = styled('button')<{ size?: SizeType }>(
    ({ theme, size = SIZE_MIDDLE }) => {
        const { iconSize, areaSize } = SIZE_CONFIG[size];

        return {
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: areaSize,
            height: areaSize,
            backgroundColor: theme.affine.palette.white,
            color: theme.affine.palette.icons,
            padding: theme.affine.spacing.iconPadding,
            borderRadius: '5px',

            '& svg': {
                width: iconSize,
                height: iconSize,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
            },

            '&:hover': {
                backgroundColor: theme.affine.palette.hover,
            },

            [`&${buttonStatus.hover}`]: {
                backgroundColor: theme.affine.palette.hover,
            },

            '&:focus': {
                color: theme.affine.palette.primary,
            },
            [`&.${buttonStatus.focus}`]: {
                color: theme.affine.palette.primary,
            },

            [`&${buttonStatus.disabled}`]: {
                cursor: 'not-allowed',
            },
        };
    }
);
