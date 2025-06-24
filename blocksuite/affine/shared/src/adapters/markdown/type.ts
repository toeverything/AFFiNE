import type {
  Blockquote,
  FootnoteDefinition,
  Root,
  RootContentMap,
} from 'mdast';

export type Markdown = string;

type MdastUnionType<
  K extends keyof RootContentMap,
  V extends RootContentMap[K],
> = V;

export type MarkdownAST =
  | MdastUnionType<keyof RootContentMap, RootContentMap[keyof RootContentMap]>
  | Root;

export const isMarkdownAST = (node: unknown): node is MarkdownAST =>
  !Array.isArray(node) &&
  'type' in (node as object) &&
  (node as MarkdownAST).type !== undefined;

export const isFootnoteDefinitionNode = (
  node: MarkdownAST
): node is FootnoteDefinition => node.type === 'footnoteDefinition';

export const getFootnoteDefinitionText = (node: FootnoteDefinition) => {
  const childNode = node.children[0];
  if (childNode.type !== 'paragraph') return '';
  const paragraph = childNode.children[0];
  if (paragraph.type !== 'text') return '';
  return paragraph.value;
};

export const isCalloutNode = (node: MarkdownAST): node is Blockquote => {
  return node.type === 'blockquote' && !!node.data?.isCallout;
};

export const getCalloutEmoji = (node: Blockquote) => {
  return node.data?.calloutEmoji ?? '';
};

export const FOOTNOTE_DEFINITION_PREFIX = 'footnoteDefinition:';
export const IN_PARAGRAPH_NODE_CONTEXT_KEY = 'mdast:paragraph';
