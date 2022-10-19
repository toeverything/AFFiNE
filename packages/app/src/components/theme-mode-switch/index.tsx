import { useState } from 'react';
import { useTheme } from '@/styles';
import { MoonIcon, SunIcon } from './icons';
import { StyledThemeModeSwitch, StyledSwitchItem } from './style';

export const ThemeModeSwitch = () => {
  const { mode, changeMode } = useTheme();
  const [isHover, setIsHover] = useState(false);
  const [firstTrigger, setFirstTrigger] = useState(false);
  return (
    <StyledThemeModeSwitch
      onMouseEnter={() => {
        setIsHover(true);
        if (!firstTrigger) {
          setFirstTrigger(true);
        }
      }}
      onMouseLeave={() => {
        setIsHover(false);
      }}
    >
      <StyledSwitchItem
        active={mode === 'light'}
        isHover={isHover}
        firstTrigger={firstTrigger}
        onClick={() => {
          changeMode('light');
        }}
      >
        <SunIcon />
      </StyledSwitchItem>
      <StyledSwitchItem
        active={mode === 'dark'}
        isHover={isHover}
        firstTrigger={firstTrigger}
        onClick={() => {
          changeMode('dark');
        }}
      >
        <MoonIcon />
      </StyledSwitchItem>
    </StyledThemeModeSwitch>
  );
};

export default ThemeModeSwitch;
