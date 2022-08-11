import { SliderUnstyled, sliderUnstyledClasses } from '@mui/base';
import type { SliderUnstyledProps } from '@mui/base';
import { alpha } from '@mui/system';
import { styled } from '../styled';

interface SliderProps {
    defaultValue?: SliderUnstyledProps['defaultValue'];
    step?: number;
    min?: number;
    max?: number;
    marks?: SliderUnstyledProps['marks'];
    value?: SliderUnstyledProps['value'];
    onChange?: SliderUnstyledProps['onChange'];
}

export const Slider = (props: SliderProps) => {
    return <StyledSlider {...props} />;
};

const StyledSlider = styled(SliderUnstyled)(
    ({ theme }) => `
    color: ${theme.affine.palette.primaryText};
    height: 2px;
    width: 100%;
    padding: 13px 0;
    display: inline-block;
    position: relative;
    cursor: pointer;
    touch-action: none;
    -webkit-tap-highlight-color: transparent;
    opacity: 0.75;

    &:hover {
      opacity: 1;
    }

    &.${sliderUnstyledClasses.disabled} {
      pointer-events: none;
      cursor: default;
      color: #bdbdbd;
    }

    & .${sliderUnstyledClasses.rail} {
      display: block;
      position: absolute;
      width: 100%;
      height: 1px;
      border-radius: 2px;
      background-color: ${theme.affine.palette.tagHover};
      opacity: 0.38;
    }

    & .${sliderUnstyledClasses.track} {
      display: block;
      position: absolute;
      height: 1px;
      border-radius: 2px;
      background-color: currentColor;
    }

    & .${sliderUnstyledClasses.thumb} {
      position: absolute;
      width: 8px;
      height: 8px;
      margin-left: -6px;
      margin-top: -5px;
      box-sizing: border-box;
      border-radius: 50%;
      outline: 0;
      background-color: currentColor;
      top: 50%;
      transform: translateY(10%);

      :hover,
      &.${sliderUnstyledClasses.focusVisible} {
        box-shadow: 0 0 0 0.25rem ${alpha(
            theme.palette.mode === 'light' ? '#1976d2' : '#90caf9',
            0.15
        )};
      }

      &.${sliderUnstyledClasses.active} {
        box-shadow: 0 0 0 0.25rem ${alpha(
            theme.palette.mode === 'light' ? '#1976d2' : '#90caf9',
            0.3
        )};
      }
    }

    & .${sliderUnstyledClasses.mark} {
      position: absolute;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background-color: ${theme.affine.palette.tagHover};
      top: 50%;
      transform: translate(-50%, -40%);
    }

    & .${sliderUnstyledClasses.markActive} {
      background-color: ${theme.affine.palette.primaryText};
    }

    & .${sliderUnstyledClasses.valueLabel} {
      font-family: IBM Plex Sans;
      font-size: 14px;
      display: block;
      position: relative;
      top: -1.6em;
      text-align: center;
      transform: translateX(-50%);
    }
    `
);
