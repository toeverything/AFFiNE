import type { CustomElement } from '..';
import { interceptMarks, MARKDOWN_REGS } from './constants';

export const isInterceptCharacter = (str: string) => {
    return interceptMarks.indexOf(str) > -1;
};

export enum MARKDOWN_STYLE_MAP {
    BOLD = 'bold',
    ITALIC = 'italic',
    STRIKETHROUGH = 'strikethrough',
    UNDER_LINE = 'underline',
}

export type MatchRes = {
    start: string;
    end: string;
    style: string;
    startLength: number;
};

export const matchMarkdown = (str: string) => {
    const regs = MARKDOWN_REGS;
    for (let i = 0; i < regs.length; i++) {
        const matchResult = str.match(regs[i].reg);
        if (matchResult && matchResult[0]) {
            return {
                start: regs[i].start,
                end: regs[i].end,
                style: regs[i].type,
                startLength: regs[i].start.length,
            } as MatchRes;
        }
    }
    return undefined;
};

export const getRandomString = function (prefix: string) {
    const x = 2147483648;
    return `${prefix}.${Math.floor(Math.random() * x).toString(36)}${Math.abs(
        Math.floor(Math.random() * x) ^ +new Date()
    ).toString(36)}`;
};

const COMMENT_PREFIX_FOR_MARK = 'comment_id_';

export const getEditorMarkForCommentId = (commentId: string) => {
    return `${COMMENT_PREFIX_FOR_MARK}${commentId}`;
};

export const getCommentsIdsOnTextNode = (textNode: Record<string, unknown>) => {
    const ids = Object.keys(textNode)
        .filter(
            maybeCommentMarkProp =>
                maybeCommentMarkProp.startsWith(COMMENT_PREFIX_FOR_MARK) &&
                textNode[maybeCommentMarkProp] !== 'resolved'
        )
        .map(commentMark => commentMark.replace(COMMENT_PREFIX_FOR_MARK, ''));
    return new Set(ids);
};

const _usefulEditorLevelProps = ['textAlign'];
/** get extra props from editor top level node; it's usually user custom props */
export const getExtraPropertiesFromEditorOutmostNode = (
    editorNode: CustomElement
) => {
    const textStyle = {} as Record<string, string>;
    _usefulEditorLevelProps.forEach(p => {
        if (p in editorNode) {
            // @ts-ignore
            textStyle[p] = editorNode[p] as string;
        }
    });

    return textStyle;
};
