/// <reference types="@webpack/env"" />

// not using import because it will break the declare module line below
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path='../../../electron/layers/preload/preload.d.ts' />

declare module '*.md' {
  const text: string;
  export default text;
}
