/// <reference types="@webpack/env"" />
declare module '*.md' {
  const text: string;
  export default text;
}

import '../../../electron/layers/preload/preload.d.ts';
