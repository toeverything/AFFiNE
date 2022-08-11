import { styled } from '@toeverything/components/ui';
import { FC, useMemo } from 'react';

interface CheckBoxProps {
    size?: number;
    height?: number;
    checked?: boolean;
    onChange: (checked: boolean) => void;
}

export const CheckBox: FC<CheckBoxProps> = ({
    size = 16,
    height = 23,
    checked,
    onChange,
}) => {
    const dynamic_style = useMemo(
        () => ({
            height: {
                height: `${height}px`,
            },
            size: {
                width: `${size}px`,
                height: `${size}px`,
            },
        }),
        [height, size]
    );
    return (
        <CheckBoxContainer
            style={dynamic_style.height}
            onClick={() => onChange(!checked)}
        >
            <div
                style={dynamic_style.size}
                className={`checkBox ${checked ? 'checked' : 'unChecked'}`}
            />
        </CheckBoxContainer>
    );
};
const CheckBoxContainer = styled('div')(() => ({
    display: 'inline-flex',
    justifyContent: 'center',
    alignItems: 'center',
    '.checkBox': {
        position: 'relative',
        borderWidth: '1.5px',
        borderRadius: '3px',
        cursor: 'pointer',
        userSelect: 'none',
        // Align border
        marginLeft: '1.5px',
        transitionDuration: '.2s',
        transitionTimingFunction: 'ease-in',
    },
    '.unChecked': {
        borderColor: '#c4c7cc',
        borderStyle: 'solid',
        backgroundColor: '#fff',
        '&:hover': {
            boxShadow: 'inset 0 0 4px rgba(165, 124, 124, 0.2)',
        },
    },
    '.checked': {
        backgroundColor: '#B9CAD5',
        borderColor: '#B9CAD5',
        '&::before': {
            content: '""',
            position: 'absolute',
            top: '4px',
            bottom: '0px',
            left: '4px',
            right: '0px',
            width: '9px',
            height: '5px',
            borderWidth: '1.5px',
            borderStyle: 'solid',
            borderColor: '#fff',
            borderTop: 'none',
            borderRight: 'none',
            transform: 'rotate(-45deg)',
        },
    },
}));
