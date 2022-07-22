/**
 * Get the position information of the dom element based on ClientRect
 * @param {HTMLElement} dom
 * @param {HTMLElement=} parent
 * @returns
 */
export function getBoundingOffsetRect(
    dom: HTMLElement | Element,
    parent?: HTMLElement
): DOMRect {
    const dom_rect = dom.getBoundingClientRect();
    if (!parent) {
        return dom_rect;
    }
    const parent_rect = parent.getBoundingClientRect();
    const x = dom_rect.x - parent_rect.x;
    const y = dom_rect.y - parent_rect.y;
    const rect = {
        width: dom_rect.width,
        height: dom_rect.height,
        x,
        y,
        left: x,
        top: y,
        right: x + dom_rect.width,
        bottom: y + dom_rect.height,
    };
    return {
        ...rect,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        toJSON() {
            return rect;
        },
    };
}

/**
 *
 * get block`s id from element or node
 * @export
 * @param {(HTMLElement | Node)} node
 * @return {*}
 */
export function getBlockIdByDom(node: HTMLElement | Node): string | undefined {
    let element;
    if (node instanceof HTMLElement) {
        element = node;
    }
    if (node instanceof Node) {
        element = node.parentElement;
    }
    return element
        ?.closest('[data-block-id]')
        ?.attributes.getNamedItem('data-block-id')?.value;
}

export function removeDomPaddingFromDomRect(
    dom: HTMLElement | Element,
    rect: DOMRect
): DOMRect {
    const client_rect = {
        x: rect.x,
        y: rect.y,
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        right: rect.right,
        width: rect.width,
        height: rect.height,
    };
    const computed_style = window.getComputedStyle(dom);
    const padding_left = parseInt(computed_style.paddingLeft);
    const padding_right = parseInt(computed_style.paddingRight);
    const padding_top = parseInt(computed_style.paddingTop);
    const padding_bottom = parseInt(computed_style.paddingBottom);

    if (client_rect) {
        client_rect.left += padding_left;
        client_rect.right -= padding_right;
        client_rect.top += padding_top;
        client_rect.bottom -= padding_bottom;
        client_rect.x = client_rect.left;
        client_rect.y = client_rect.top;
        client_rect.width = client_rect.right - client_rect.left;
        client_rect.height = client_rect.bottom - client_rect.top;
    }
    return {
        ...client_rect,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        toJSON() {
            return client_rect;
        },
    };
}

export const withUnit = (text: string | number, unit = 'px') => {
    return `${text}${unit}`;
};

export const withPx = (text: string | number) => withUnit(text, 'px');

export const ownerDocument = (node: Node | null | undefined): Document => {
    return (node && node.ownerDocument) || document;
};

export const getBlockIdByNode = (node: Node) => {
    return (
        node.parentElement
            ?.closest('[data-block-id]')
            ?.attributes.getNamedItem('data-block-id')?.value ?? undefined
    );
};
