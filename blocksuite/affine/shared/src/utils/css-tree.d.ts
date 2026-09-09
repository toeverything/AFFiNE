declare module 'css-tree' {
  export interface CssNode {
    type: string;
    property?: string;
    name?: string;
    prelude?: CssNode | null;
    children?: CssNodeList;
    [key: string]: unknown;
  }

  export interface CssNodeList {
    toArray(): CssNode[];
  }

  export interface CssList {
    remove(item: CssNode): void;
  }

  export interface WalkOptions {
    visit?: string;
    enter?: (node: CssNode, item?: CssNode, list?: CssList) => void;
  }

  export function parse(
    css: string,
    options?: { context?: string; [key: string]: unknown }
  ): CssNode;

  export function walk(node: CssNode, options: WalkOptions): void;

  export function generate(node: CssNode): string;
}
