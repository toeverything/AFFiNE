import type { EditorHost, TextSelection } from '@blocksuite/affine/std';
import { getSelectedBlocksCommand } from '@blocksuite/affine-shared/commands';
import * as Y from 'yjs';

export interface CommentMeta {
  id: string;
  date: number;
}
export interface CommentRange {
  start: {
    id: string;
    index: Y.RelativePosition;
  };
  end: {
    id: string;
    index: Y.RelativePosition;
  };
}
export interface CommentContent {
  quote: string;
  author: string;
  text: Y.Text;
}

export type Comment = CommentMeta & CommentRange & CommentContent;

export class CommentManager {
  private get _command() {
    return this.host.command;
  }

  get commentsMap() {
    return this.host.store.spaceDoc.getMap<Y.Map<unknown>>('comments');
  }

  constructor(readonly host: EditorHost) {}

  addComment(
    selection: TextSelection,
    payload: Pick<CommentContent, 'author' | 'text'>
  ): Comment {
    const parseResult = this.parseTextSelection(selection);
    if (!parseResult) {
      throw new Error('Invalid selection');
    }

    const { quote, range } = parseResult;
    const id = this.host.store.workspace.idGenerator();
    const comment: Comment = {
      id,
      date: Date.now(),
      start: range.start,
      end: range.end,
      quote,
      ...payload,
    };
    this.commentsMap.set(id, new Y.Map<unknown>(Object.entries(comment)));
    return comment;
  }

  getComments(): Comment[] {
    const comments: Comment[] = [];
    this.commentsMap.forEach((comment, key) => {
      const start = comment.get('start') as Comment['start'];
      const end = comment.get('end') as Comment['end'];

      const startIndex = Y.createAbsolutePositionFromRelativePosition(
        start.index,
        this.host.store.spaceDoc
      );
      const startBlock = this.host.view.getBlock(start.id);
      const endIndex = Y.createAbsolutePositionFromRelativePosition(
        end.index,
        this.host.store.spaceDoc
      );
      const endBlock = this.host.view.getBlock(end.id);

      if (!startIndex || !startBlock || !endIndex || !endBlock) {
        // remove outdated comment
        this.commentsMap.delete(key);
        return;
      }

      const result: Comment = {
        id: comment.get('id') as Comment['id'],
        date: comment.get('date') as Comment['date'],
        start,
        end,
        quote: comment.get('quote') as Comment['quote'],
        author: comment.get('author') as Comment['author'],
        text: comment.get('text') as Comment['text'],
      };
      comments.push(result);
    });
    return comments;
  }

  parseTextSelection(selection: TextSelection): {
    quote: CommentContent['quote'];
    range: CommentRange;
  } | null {
    const [_, ctx] = this._command
      .chain()
      .pipe(getSelectedBlocksCommand, {
        currentTextSelection: selection,
        types: ['text'],
      })
      .run();
    const blocks = ctx.selectedBlocks;
    if (!blocks || blocks.length === 0) return null;

    const { from, to } = selection;
    const fromBlock = blocks[0];
    const fromBlockText = fromBlock.model.text;
    const fromBlockId = fromBlock.model.id;
    const toBlock = blocks[blocks.length - 1];
    const toBlockText = toBlock.model.text;
    const toBlockId = toBlock.model.id;
    if (!fromBlockText || !toBlockText) return null;

    const startIndex = Y.createRelativePositionFromTypeIndex(
      fromBlockText.yText,
      from.index
    );
    const endIndex = Y.createRelativePositionFromTypeIndex(
      toBlockText.yText,
      to ? to.index + to.length : from.index + from.length
    );
    const quote = blocks.reduce((acc, block, index) => {
      const text = block.model.text;
      if (!text) return acc;

      if (index === 0) {
        return (
          acc +
          text.yText.toString().slice(from.index, from.index + from.length)
        );
      }
      if (index === blocks.length - 1 && to) {
        return acc + ' ' + text.yText.toString().slice(0, to.index + to.length);
      }

      return acc + ' ' + text.yText.toString();
    }, '');

    return {
      quote,
      range: {
        start: {
          id: fromBlockId,
          index: startIndex,
        },
        end: {
          id: toBlockId,
          index: endIndex,
        },
      },
    };
  }
}
