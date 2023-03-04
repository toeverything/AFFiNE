import { useTheme } from 'next-themes';
import { useState } from 'react';

import { MoonIcon, SunIcon } from './Icons';
import { StyledSwitchItem, StyledThemeModeSwitch } from './style';
export const ThemeModeSwitch = () => {
  const { resolvedTheme, setTheme } = useTheme();
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
        data-testid="change-theme-dark"
        active={resolvedTheme === 'light'}
        isHover={isHover}
        firstTrigger={firstTrigger}
        onClick={() => {
          setTheme('dark');
        }}
      >
        <SunIcon />
      </StyledSwitchItem>
      <StyledSwitchItem
        data-testid="change-theme-light"
        active={resolvedTheme === 'dark'}
        isHover={isHover}
        firstTrigger={firstTrigger}
        onClick={() => {
          setTheme('light');
        }}
      >
        <MoonIcon />
      </StyledSwitchItem>
    </StyledThemeModeSwitch>
  );
};

export default ThemeModeSwitch;
