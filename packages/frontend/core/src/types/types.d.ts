/// <reference types="@webpack/env" />
/// <reference types="@rspack/core/module" />

declare module '*.md' {
  const text: string;
  export default text;
}

declare module '*.assets.svg' {
  const url: string;
  export default url;
}

declare module '*.zip' {
  const url: string;
  export default url;
}

declare module '*.png' {
  const url: string;
  export default url;
}

declare module '*.jpg' {
  const url: string;
  export default url;
}

declare module '*.inline.svg' {
  const src: string;
  export default src;
}

declare module '*.wasm' {
  const url: string;
  export default url;
}

declare module '*.wasm?url' {
  const url: string;
  export default url;
}
