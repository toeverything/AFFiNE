import { getLightTheme, ThemeProvider } from '../src';

export const parameters = {
  actions: { argTypesRegex: '^on[A-Z].*' },
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/,
    },
  },
};

const lightTheme = getLightTheme('page');

export const decorators = [
  Story => {
    return (
      <ThemeProvider theme={lightTheme}>
        <Story />
      </ThemeProvider>
    );
  },
];
