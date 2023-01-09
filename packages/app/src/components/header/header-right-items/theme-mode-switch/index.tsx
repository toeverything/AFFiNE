import { useState } from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { MoonIcon, SunIcon } from './Icons';
import { StyledThemeModeSwitch, StyledSwitchItem } from './style';

export const ThemeModeSwitch = () => {
  const { mode, changeMode } = useTheme();
  const [isHover, setIsHover] = useState(false);
  const [firstTrigger, setFirstTrigger] = useState(false);
  return (
    <StyledThemeModeSwitch
      data-testid="change-theme-container"
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
        data-testid="change-theme-light"
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
        data-testid="change-theme-dark"
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
