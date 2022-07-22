import type { CSSProperties } from 'react';
import { styled } from '../styled';
import { useSwitch, UseSwitchParameters } from '@mui/base/SwitchUnstyled';
import { ReactNode } from 'react';

/**
 *  Switch is extend by mui SwitchUnstyled
 *
 * SwitchUnstyled Demos:
 * - [SwitchUnstyled](https://mui.com/zh/base/react-switch/)
 *
 * SwitchUnstyled API:
 * - [SwitchUnstyled API](https://mui.com/zh/base/api/switch-unstyled/)
 *
 * Add some props to use in business:
 * - `checkedLabel` and `uncheckedLabel` is used to show switch label, and you can write label custom by props `label`
 * - `width` is used to limit the wrapper, it should always set if `checkedLabel` and `uncheckedLabel`  is different，otherwise wrapper will shake when label change
 *
 * Easy Demo:
 * ```jsx
 *      <Switch checkedLabel="ON" uncheckedLabel="OFF" width={50} />
 * ```
 *
 * **/
export type SwitchProps = {
    label?: (params: { checked: boolean; disabled: boolean }) => ReactNode;
    checkedLabel?: string;
    uncheckedLabel?: string;
    style?: CSSProperties;
    width?: number | string;
} & UseSwitchParameters;

export const Switch = (props: SwitchProps) => {
    const { label, checkedLabel, uncheckedLabel, style, width } = props;
    const { getInputProps, checked, disabled } = useSwitch(props);

    return (
        <StyledWrapper style={{ ...style, width }}>
            <StyledLabel checked={checked} disable={disabled}>
                {checked ? checkedLabel : uncheckedLabel}
                {label?.({ checked, disabled })}
            </StyledLabel>
            <StyledRoot>
                <StyleTrack checked={checked}>
                    <StyledThumb checked={checked} disable={disabled} />
                </StyleTrack>
                <StyledSwitchInput {...getInputProps()} />
            </StyledRoot>
        </StyledWrapper>
    );
};

const StyledRoot = styled('span')`
    display: inline-block;
    position: relative;
    width: 22px;
    height: 12px;
`;

const StyledSwitchInput = styled('input')`
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    opacity: 0;
    z-index: 1;
    margin: 0;
    cursor: pointer;
`;

const StyledThumb = styled('span')<{
    disable: boolean;
    checked: boolean;
}>(({ theme, checked, disable }) => {
    return {
        position: 'absolute',
        display: 'block',
        backgroundColor: checked ? '#fff' : theme.affine.palette.primary,
        width: '8px',
        height: '8px',
        borderRadius: '2px',
        top: '2px',
        left: '2px',
        transform: checked ? 'translateX(10px)' : '',
        transition:
            'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1), background-color .15s',
    };
});

const StyleTrack = styled('span')<{ checked: boolean }>(
    ({ theme, checked }) => ({
        backgroundColor: checked ? theme.affine.palette.primary : '#fff',
        border: `1px solid ${theme.affine.palette.primary}`,
        borderRadius: '3px',
        width: '100%',
        height: '100%',
        display: 'block',
        transition: 'background-color .15s, border-color .15s',
    })
);

const StyledWrapper = styled('label')`
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
`;

const StyledLabel = styled('div')<{ disable: boolean; checked: boolean }>(
    ({ theme, disable, checked }) => {
        return {
            display: 'inline-flex',
            color: theme.affine.palette.primary,
            fontSize: '12px',
            marginRight: '5px',
        };
    }
);
