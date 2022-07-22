import { debounce } from '@toeverything/utils';
import EventEmitter from 'eventemitter3';

import { BlockEditor } from '../..';

const mouseupEventName = 'mouseup';
const mousemoveEventName = 'mousemove';

export class MouseManager {
    private _editor: BlockEditor;
    private is_mouse_down: boolean;
    private mousedown_timer: number;
    private is_dragging: boolean;
    private _events = new EventEmitter();

    constructor(editor: BlockEditor) {
        this._editor = editor;
        this.is_mouse_down = false;
        this.is_dragging = false;
        this.init_editor_mouse_event_handler();
    }

    get isMouseDown() {
        return this.is_mouse_down;
    }

    get isDragging() {
        return this.is_dragging;
    }

    private init_editor_mouse_event_handler() {
        this.handle_mouse_down = this.handle_mouse_down.bind(this);
        this.handle_mouse_up = this.handle_mouse_up.bind(this);
        this.handle_mouse_down_capture =
            this.handle_mouse_down_capture.bind(this);
        // TODO: IMP: Check later to see if there is any need to add drag
        this.handle_mouse_drag = debounce(
            this.handle_mouse_drag.bind(this),
            15
        );
        this.handle_mouse_move = this.handle_mouse_move.bind(this);
        window.addEventListener('mousedown', this.handle_mouse_down_capture, {
            capture: true,
        });
        window.addEventListener('mousedown', this.handle_mouse_down);
        window.addEventListener('mouseup', this.handle_mouse_up);
        window.addEventListener('mousemove', this.handle_mouse_move);
    }

    private handle_mouse_down_capture(e: MouseEvent) {
        this.is_mouse_down = true;
    }

    private handle_mouse_down(e: MouseEvent) {
        this.mousedown_timer = window.setTimeout(() => {
            window.addEventListener('mousemove', this.handle_mouse_drag);
            this.mousedown_timer = undefined;
        }, 30);
    }

    private handle_mouse_up(e: MouseEvent) {
        this.is_mouse_down = false;
        this.is_dragging = false;
        if (this.mousedown_timer) {
            window.clearTimeout(this.mousedown_timer);
        }
        this._events.emit(mouseupEventName, e);
        window.removeEventListener('mousemove', this.handle_mouse_drag);
    }

    private get_select_start_event_name(blockId: string) {
        return `${blockId}-select_start`;
    }

    private handle_mouse_drag(e: MouseEvent) {
        const selectionInfo = this._editor.selectionManager.currentSelectInfo;
        if (selectionInfo.type === 'Range') {
            if (selectionInfo.anchorNode) {
                this.emit_select_start_with(selectionInfo.anchorNode.id, e);
            }
        }
    }

    private handle_mouse_move(e: MouseEvent) {
        this._events.emit(mousemoveEventName, e);
    }

    public onSelectStartWith = (
        blockId: string,
        cb: (e: MouseEvent) => void
    ) => {
        this._events.on(this.get_select_start_event_name(blockId), cb);
    };

    public offSelectStartWith = (
        blockId: string,
        cb: (e: MouseEvent) => void
    ) => {
        this._events.off(this.get_select_start_event_name(blockId), cb);
    };

    public onMouseupEventOnce(cb: (e: MouseEvent) => void) {
        this._events.once(mouseupEventName, cb);
    }

    public onMouseUp(cb: (e: MouseEvent) => void) {
        this._events.on(mouseupEventName, cb);
    }

    public offMouseUp(cb: (e: MouseEvent) => void) {
        this._events.on(mouseupEventName, cb);
    }

    public onMouseMove(cb: (e: MouseEvent) => void) {
        this._events.on(mousemoveEventName, cb);
    }

    public offMouseMove(cb: (e: MouseEvent) => void) {
        this._events.off(mousemoveEventName, cb);
    }

    public dispose() {
        this._events.removeAllListeners();
        window.removeEventListener(
            'mousedown',
            this.handle_mouse_down_capture,
            {
                capture: true,
            }
        );
        window.removeEventListener('mousedown', this.handle_mouse_down);
        window.removeEventListener('mouseup', this.handle_mouse_up);
        window.removeEventListener('mousemove', this.handle_mouse_drag);
        window.removeEventListener('mousemove', this.handle_mouse_move);
    }

    /**
     *
     * emit browser select start event to the start block by start id
     * @private
     * @memberof MouseManager
     */
    private emit_select_start_with(id: string, e: MouseEvent) {
        this._events.emit(this.get_select_start_event_name(id), e);
    }
}
