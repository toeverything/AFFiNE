import {
  LatexEditorUnitSpecExtension,
  LatexInlineSpecExtension,
} from './inline-spec';
import { LatexEditorInlineManagerExtension } from './latex-node/latex-editor-menu';

export const inlineLatexExtensions = [
  LatexInlineSpecExtension,
  LatexEditorUnitSpecExtension,
  LatexEditorInlineManagerExtension,
];
