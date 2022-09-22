import '@emotion/react';

interface AffineTheme {
  colors: {
    primary: string;
  };
}

export const theme: AffineTheme = {
  colors: {
    primary: '#0070f3',
  },
};

declare module '@emotion/react' {
  export interface Theme extends AffineTheme {}
}
