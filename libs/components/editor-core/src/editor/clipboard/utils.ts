import { getRandomString } from '@toeverything/components/common';
import { BlockFlavorKeys, Protocol } from '@toeverything/datasource/db-service';
import { ClipBlockInfo } from './types';

const getIsLink = (htmlElement: HTMLElement) => {
    return ['A', 'IMG'].includes(htmlElement.tagName);
};
export const getIsTextLink = (str: string) => {
    const regex = new RegExp(
        /https?:\/\/(www\.)?[-a-zA-Z\d@:%._+~#=]{1,256}\.[a-zA-Z\d()]{1,6}\b([-a-zA-Z\d()@:%_+.~#?&//=]*)/gi
    );
    return regex.test(str);
};
export const linkText2Block = (url: string) => {
    return {
        type: 'text',
        properties: {
            text: {
                value: [
                    {
                        children: [
                            {
                                text: url,
                            },
                        ],
                        type: 'link',
                        url: url,
                        id: getRandomString('link'),
                    },
                ],
            },
        },
        children: [],
    } as unknown as ClipBlockInfo;
};
const getTextStyle = (htmlElement: HTMLElement) => {
    const tagName = htmlElement.tagName;
    const textStyle: { [key: string]: any } = {};

    const style = (htmlElement.getAttribute('style') || '')
        .split(';')
        .reduce((style: { [key: string]: any }, styleString) => {
            const [key, value] = styleString.split(':');
            if (key && value) {
                style[key] = value;
            }
            return style;
        }, {});

    if (
        style['font-weight'] === 'bold' ||
        Number(style['font-weight']) > 400 ||
        ['STRONG', 'B', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(
            htmlElement.tagName
        )
    ) {
        textStyle['bold'] = true;
    }
    if (getIsLink(htmlElement)) {
        textStyle['type'] = 'link';
        textStyle['url'] =
            htmlElement.getAttribute('href') || htmlElement.getAttribute('src');
        textStyle['id'] = getRandomString('link');
    }

    if (tagName === 'EM' || style['fontStyle'] === 'italic') {
        textStyle['italic'] = true;
    }
    if (
        tagName === 'U' ||
        (style['text-decoration'] &&
            style['text-decoration'].indexOf('underline') !== -1) ||
        style['border-bottom']
    ) {
        textStyle['underline'] = true;
    }
    if (tagName === 'CODE') {
        textStyle['inlinecode'] = true;
    }
    if (
        tagName === 'S' ||
        tagName === 'DEL' ||
        (style['text-decoration'] &&
            style['text-decoration'].indexOf('line-through') !== -1)
    ) {
        textStyle['strikethrough'] = true;
    }

    return textStyle;
};

export const commonHTML2Block = (
    element: HTMLElement | Node,
    type: BlockFlavorKeys = Protocol.Block.Type.text,
    ignoreEmptyElement = true
): ClipBlockInfo => {
    const textValue = commonHTML2Text(element, {}, ignoreEmptyElement);
    if (!textValue.length && ignoreEmptyElement) {
        return null;
    }
    return {
        type,
        properties: {
            text: { value: textValue },
        },
        children: [],
    };
};

const getSingleLabelHTMLElementContent = (htmlElement: HTMLElement) => {
    if (htmlElement.tagName === 'IMG') {
        return (
            htmlElement.getAttribute('alt') || htmlElement.getAttribute('src')
        );
    }
    return '';
};
export const commonHTML2Text = (
    element: HTMLElement | Node,
    textStyle: { [key: string]: any } = {},
    ignoreEmptyText = true
) => {
    if (element instanceof Text) {
        return element.textContent.split('\n').map(text => {
            return { text: text, ...textStyle };
        });
    }
    const htmlElement = element as HTMLElement;
    const childNodes = Array.from(htmlElement.childNodes);

    const isLink = getIsLink(htmlElement);
    const currentTextStyle = getTextStyle(htmlElement);

    if (!childNodes.length) {
        const singleLabelContent =
            getSingleLabelHTMLElementContent(htmlElement);
        if (isLink && singleLabelContent) {
            return [
                {
                    children: [
                        {
                            text: singleLabelContent,
                        },
                    ],
                    ...currentTextStyle,
                },
            ];
        }
        return ignoreEmptyText ? [] : [{ text: '', ...currentTextStyle }];
    }

    const childTexts = childNodes
        .reduce((result, childNode) => {
            const textBlocks = commonHTML2Text(
                childNode,
                isLink
                    ? textStyle
                    : {
                          ...textStyle,
                          ...currentTextStyle,
                      },
                ignoreEmptyText
            );
            result.push(...textBlocks);
            return result;
        }, [])
        .filter(v => v);

    if (isLink && childTexts.length) {
        return [
            {
                children: childTexts,
                ...currentTextStyle,
            },
        ];
    }
    return childTexts;
};
