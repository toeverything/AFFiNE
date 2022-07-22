import EventEmitter from 'eventemitter3';

import { domToRect, Rect } from '@toeverything/utils';
import type { Editor as BlockEditor } from '../editor';

import { AsyncBlock } from '../block';

type VerticalTypes = 'up' | 'down' | null;
type HorizontalTypes = 'left' | 'right' | null;

export class ScrollManager {
    private _editor: BlockEditor;
    private _animation_frame: null | number = null;
    private _event_name = 'scrolling';
    private _current_move_direction: [HorizontalTypes, VerticalTypes] = [
        null,
        null,
    ];

    public scrollMoveOffset = 8;
    public scrollingEvent = new EventEmitter();

    constructor(editor: BlockEditor) {
        this._editor = editor;
    }

    private update_scroll_info(left: number, top: number) {
        this.scrollTop = top;
        this.scrollLeft = left;
    }

    public onScrolling(
        cb: (args: { direction: [HorizontalTypes, VerticalTypes] }) => void
    ) {
        this.scrollingEvent.on(this._event_name, cb);
    }
    public removeScrolling(
        cb: (args: { direction: [HorizontalTypes, VerticalTypes] }) => void
    ) {
        this.scrollingEvent.removeListener(this._event_name, cb);
    }

    public get scrollContainer() {
        return this._editor.ui_container;
    }

    public get verticalScrollTriggerDistance() {
        return 15;
    }
    public get horizontalScrollTriggerDistance() {
        // Set horizon distance when support horizontal scroll
        return -1;
    }

    public get scrollTop() {
        return this._editor.ui_container.scrollTop;
    }
    public set scrollTop(top: number) {
        this._editor.ui_container.scrollTop = top;
    }
    public get scrollLeft() {
        return this._editor.ui_container.scrollLeft;
    }
    public set scrollLeft(left: number) {
        this._editor.ui_container.scrollLeft = left;
    }

    public scrollTo({
        top,
        left,
        behavior = 'smooth',
    }: {
        top?: number;
        left?: number;
        behavior?: ScrollBehavior; // "auto" | "smooth";
    }) {
        top = top !== undefined ? top : this.scrollContainer.scrollTop;
        left = left !== undefined ? left : this.scrollContainer.scrollLeft;

        if (behavior === 'smooth') {
            this._editor.ui_container.scrollBy({
                top,
                left,
                behavior,
            });
        } else {
            this._editor.ui_container.scrollTo(left, top);
        }
    }

    public async scrollIntoViewByBlockId(
        blockId: string,
        behavior: ScrollBehavior = 'smooth'
    ) {
        const block = await this._editor.getBlockById(blockId);

        await this.scrollIntoViewByBlock(block, behavior);
    }

    public async scrollIntoViewByBlock(
        block: AsyncBlock,
        behavior: ScrollBehavior = 'smooth'
    ) {
        if (!block.dom) {
            return console.warn(`Block is not exist.`);
        }
        const containerRect = domToRect(this._editor.ui_container);
        const blockRect = domToRect(block.dom);

        const blockRelativeTopToEditor =
            blockRect.top - containerRect.top - containerRect.height / 4;
        const blockRelativeLeftToEditor = blockRect.left - containerRect.left;

        this.scrollTo({
            left: blockRelativeLeftToEditor,
            top: blockRelativeTopToEditor,
            behavior,
        });
        this.update_scroll_info(
            blockRelativeLeftToEditor,
            blockRelativeTopToEditor
        );
    }

    public async keepBlockInView(
        blockIdOrBlock: string | AsyncBlock,
        behavior: ScrollBehavior = 'auto'
    ) {
        const block =
            typeof blockIdOrBlock === 'string'
                ? await this._editor.getBlockById(blockIdOrBlock)
                : blockIdOrBlock;

        if (!block.dom) {
            return console.warn(`Block is not exist.`);
        }
        const blockRect = domToRect(block.dom);

        const value = this.get_keep_in_view_params(blockRect);

        if (value !== 0) {
            this.scrollTo({
                top: this.scrollTop + blockRect.height * value,
                behavior,
            });
        }
    }

    private get_keep_in_view_params(blockRect: Rect) {
        const { top, bottom } = domToRect(this._editor.ui_container);
        if (blockRect.top <= top + blockRect.height * 3) {
            return -1;
        }

        if (blockRect.bottom >= bottom - blockRect.height * 3) {
            return 1;
        }
        return 0;
    }

    public scrollToBottom(behavior: ScrollBehavior = 'auto') {
        const containerRect = domToRect(this.scrollContainer);
        const scrollTop =
            this.scrollContainer.scrollHeight - containerRect.height;
        this.scrollTo({ top: scrollTop, behavior });
    }

    public scrollToTop(behavior: ScrollBehavior = 'auto') {
        this.scrollTo({ top: 0, behavior });
    }

    private auto_scroll() {
        const xValue =
            this._current_move_direction[0] === 'left'
                ? -1
                : this._current_move_direction[0] === 'right'
                ? 1
                : 0;
        const yValue =
            this._current_move_direction[1] === 'up'
                ? -1
                : this._current_move_direction[1] === 'down'
                ? 1
                : 0;

        const horizontalOffset = this.scrollMoveOffset * xValue;
        const verticalOffset = this.scrollMoveOffset * yValue;

        const calcLeft = this.scrollLeft + horizontalOffset;
        const calcTop = this.scrollTop + verticalOffset;
        //  If the scrollbar is out of range, the event is no longer fired
        if (
            (calcTop <= 0 ||
                calcTop >=
                    this.scrollContainer.scrollHeight -
                        this.scrollContainer.offsetHeight) &&
            (calcLeft <= 0 ||
                calcLeft >=
                    this.scrollContainer.scrollWidth -
                        this.scrollContainer.offsetWidth)
        ) {
            return;
        }

        this._animation_frame = requestAnimationFrame(() => {
            const left = this.scrollLeft + horizontalOffset;
            const top = this.scrollTop + verticalOffset;

            this.scrollTo({
                left,
                top,
                behavior: 'auto',
            });
            this.update_scroll_info(left, top);
            this.scrollingEvent.emit(this._event_name, {
                direction: this._current_move_direction,
            });
            this.auto_scroll();
        });
    }

    public startAutoScroll(direction: [HorizontalTypes, VerticalTypes]) {
        if (direction[0] === null && direction[1] === null) {
            this._current_move_direction = direction;
            this.stopAutoScroll();
            return;
        }
        if (
            direction[0] !== this._current_move_direction[0] ||
            direction[1] !== this._current_move_direction[1]
        ) {
            this._current_move_direction = direction;
            this.stopAutoScroll();
        } else {
            return;
        }
        this.auto_scroll();
    }
    public stopAutoScroll() {
        if (this._animation_frame) {
            cancelAnimationFrame(this._animation_frame);
            this._animation_frame = null;
        }
    }
}
