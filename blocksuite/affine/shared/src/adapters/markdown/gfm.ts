/*
MIT License

Copyright (c) 2020 Titus Wormer <tituswormer@gmail.com>

mdast-util-gfm-autolink-literal is from markdown only.
*/
import type { Nodes, Root } from 'mdast';
import { gfmAutolinkLiteralFromMarkdown } from 'mdast-util-gfm-autolink-literal';
import {
  gfmFootnoteFromMarkdown,
  gfmFootnoteToMarkdown,
} from 'mdast-util-gfm-footnote';
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown,
} from 'mdast-util-gfm-strikethrough';
import { gfmTableFromMarkdown, gfmTableToMarkdown } from 'mdast-util-gfm-table';
import {
  gfmTaskListItemFromMarkdown,
  gfmTaskListItemToMarkdown,
} from 'mdast-util-gfm-task-list-item';
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal';
import { gfmFootnote } from 'micromark-extension-gfm-footnote';
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough';
import { gfmTable } from 'micromark-extension-gfm-table';
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item';
import { combineExtensions } from 'micromark-util-combine-extensions';
import type { Processor } from 'unified';
import { visit } from 'unist-util-visit';

export function gfm() {
  return combineExtensions([
    gfmAutolinkLiteral(),
    gfmStrikethrough(),
    gfmTable(),
    gfmTaskListItem(),
    gfmFootnote(),
  ]);
}

function gfmFromMarkdown() {
  return [
    gfmStrikethroughFromMarkdown(),
    gfmTableFromMarkdown(),
    gfmTaskListItemFromMarkdown(),
    gfmAutolinkLiteralFromMarkdown(),
    gfmFootnoteFromMarkdown(),
  ];
}

function gfmToMarkdown() {
  return {
    extensions: [
      gfmStrikethroughToMarkdown(),
      // Do not pad cells out to the widest value in the column. One long
      // cell made every row that wide, which turned a small table into
      // hundreds of columns of trailing spaces.
      gfmTableToMarkdown({ tablePipeAlign: false }),
      gfmTaskListItemToMarkdown(),
      gfmFootnoteToMarkdown(),
    ],
  };
}

export function remarkGfm(this: Processor) {
  // oxlint-disable-next-line typescript/no-this-alias
  const self = this;
  const data = self.data();

  const micromarkExtensions =
    data.micromarkExtensions || (data.micromarkExtensions = []);
  const fromMarkdownExtensions =
    data.fromMarkdownExtensions || (data.fromMarkdownExtensions = []);
  const toMarkdownExtensions =
    data.toMarkdownExtensions || (data.toMarkdownExtensions = []);

  micromarkExtensions.push(gfm());
  fromMarkdownExtensions.push(gfmFromMarkdown());
  toMarkdownExtensions.push(gfmToMarkdown());
}

// A table cell cannot hold a newline. The serializer writes a character
// reference for one, which reads as &#xA; in the exported table, so the
// newline becomes a space first. Code and raw HTML keep their own text.
const KEEPS_ITS_TEXT = new Set(['code', 'html', 'inlineCode']);

function flattenText(node: Nodes) {
  if (KEEPS_ITS_TEXT.has(node.type)) return;
  if (node.type === 'text') {
    node.value = node.value.replace(/\r?\n/g, ' ');
    return;
  }
  if ('children' in node) {
    for (const child of node.children) flattenText(child);
  }
}

export function flattenTableCellNewlines(tree: Root) {
  visit(tree, 'tableCell', cell => {
    flattenText(cell);
  });
}
