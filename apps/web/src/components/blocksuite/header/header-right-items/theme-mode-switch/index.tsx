import { useTheme } from 'next-themes';
import { useState } from 'react';

import { MoonIcon, SunIcon } from './Icons';
import { StyledSwitchItem, StyledThemeModeSwitch } from './style';
export const ThemeModeSwitch = () => {
  const { theme, setTheme } = useTheme();
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
        active={theme === 'light'}
        isHover={isHover}
        firstTrigger={firstTrigger}
        onClick={() => {
          setTheme('light');
        }}
      >
        <SunIcon />
      </StyledSwitchItem>
      <StyledSwitchItem
        data-testid="change-theme-dark"
        active={theme === 'dark'}
        isHover={isHover}
        firstTrigger={firstTrigger}
        onClick={() => {
          setTheme('dark');
        }}
      >
        <MoonIcon />
      </StyledSwitchItem>
    </StyledThemeModeSwitch>
  );
};

export default ThemeModeSwitch;
