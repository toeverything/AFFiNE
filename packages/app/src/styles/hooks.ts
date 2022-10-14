import { useContext } from 'react';
import { ThemeContext } from './themeProvider';

export const useTheme = () => useContext(ThemeContext);
