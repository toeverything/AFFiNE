import {
  type MarkdownAdapterPreprocessor,
  MarkdownPreprocessorExtension,
} from '@blocksuite/affine-shared/adapters';

function escapeBrackets(text: string) {
  const pattern =
    /(```[\S\s]*?```|`.*?`)|\\\[([\S\s]*?[^\\])\\]|\\\((.*?)\\\)/g;
  return text.replaceAll(
    pattern,
    (match, codeBlock, squareBracket, roundBracket) => {
      if (codeBlock) {
        return codeBlock;
      } else if (squareBracket) {
        return `$$${squareBracket}$$`;
      } else if (roundBracket) {
        return `$${roundBracket}$`;
      }
      return match;
    }
  );
}

function escapeMhchem(text: string) {
  return text.replaceAll('$\\ce{', '$\\\\ce{').replaceAll('$\\pu{', '$\\\\pu{');
}

/**
 * Preprocess the content to protect code blocks and LaTeX expressions
 * reference issue: https://github.com/remarkjs/react-markdown/issues/785
 * reference comment: https://github.com/remarkjs/react-markdown/issues/785#issuecomment-2307567823
 * @param content - The content to preprocess
 * @returns The preprocessed content
 */
function preprocessLatex(content: string) {
  // Protect code blocks
  const codeBlocks: string[] = [];
  let preprocessedContent = content;
  preprocessedContent = preprocessedContent.replace(
    /(```[\s\S]*?```|`[^`\n]+`)/g,
    (_, code) => {
      codeBlocks.push(code);
      return `<<CODE_BLOCK_${codeBlocks.length - 1}>>`;
    }
  );

  // Protect existing LaTeX expressions
  const latexExpressions: string[] = [];
  preprocessedContent = preprocessedContent.replace(
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\))/g,
    match => {
      latexExpressions.push(match);
      return `<<LATEX_${latexExpressions.length - 1}>>`;
    }
  );

  // Escape dollar signs that are likely currency indicators
  preprocessedContent = preprocessedContent.replace(/\$(?=\d)/g, '\\$');

  // Restore LaTeX expressions
  preprocessedContent = preprocessedContent.replace(
    /<<LATEX_(\d+)>>/g,
    (_, index) => latexExpressions[parseInt(index)]
  );

  // Restore code blocks
  preprocessedContent = preprocessedContent.replace(
    /<<CODE_BLOCK_(\d+)>>/g,
    (_, index) => codeBlocks[parseInt(index)]
  );

  // Apply additional escaping functions
  preprocessedContent = escapeBrackets(preprocessedContent);
  preprocessedContent = escapeMhchem(preprocessedContent);

  return preprocessedContent;
}

const latexPreprocessor: MarkdownAdapterPreprocessor = {
  name: 'latex',
  levels: ['block', 'slice', 'doc'],
  preprocess: content => {
    return preprocessLatex(content);
  },
};

export const LatexMarkdownPreprocessorExtension =
  MarkdownPreprocessorExtension(latexPreprocessor);
