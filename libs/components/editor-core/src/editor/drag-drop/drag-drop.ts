import { domToRect, Point } from '@toeverything/utils';
import { AsyncBlock } from '../..';
import { GridDropType } from '../commands/types';
import { Editor } from '../editor';
import { BlockDropPlacement, GroupDirection } from '../types';
// TODO: Evaluate implementing custom events with Rxjs
import EventEmitter from 'eventemitter3';

enum DragType {
    dragBlock = 'dragBlock',
    dragGroup = 'dragGroup',
}

const DRAG_STATE_CHANGE_EVENT_KEY = 'dragStateChange';
const MAX_GRID_BLOCK_FLOOR = 3;
export class DragDropManager {
    private _editor: Editor;
    private _enabled: boolean;
    private _events = new EventEmitter();

    private _blockIdKey = 'blockId';
    private _rootIdKey = 'rootId';
    private _dragType?: DragType;
    private _blockDragDirection: BlockDropPlacement;
    private _blockDragTargetId?: string;

    private _dragBlockHotDistance = 20;

    private _dragActions = DragType;

    private _isOnDrag = false;

    get dragActions() {
        return this._dragActions;
    }

    get isOnDrag() {
        return this._isOnDrag;
    }

    set isOnDrag(isOnDrag: boolean) {
        if (this._isOnDrag !== isOnDrag) {
            this._events.emit(DRAG_STATE_CHANGE_EVENT_KEY, isOnDrag);
        }
        this._isOnDrag = isOnDrag;
    }

    constructor(editor: Editor) {
        this._editor = editor;
        this._enabled = true;
        this._blockDragDirection = BlockDropPlacement.none;
        this._initMouseEvent();
    }

    get dragType() {
        return this._dragType;
    }

    set dragType(type: DragType) {
        this._dragType = type;
    }

    private async _initMouseEvent() {
        this._editor.mouseManager.onMouseUp(() => {
            // IMP: temporarily last protect for dragging across editor instances，bad case
            if (this.isOnDrag) {
                this.isOnDrag = false;
            }
        });
    }

    private _setBlockDragDirection(direction: BlockDropPlacement) {
        this._blockDragDirection = direction;
    }

    private _setBlockDragTargetId(id: string) {
        this._blockDragTargetId = id;
    }

    private async _canBeDrop(event: React.DragEvent<Element>) {
        const blockId = event.dataTransfer.getData(this._blockIdKey);
        if (blockId === undefined || this._blockDragTargetId === undefined) {
            return false;
        }
        let curr = this._blockDragTargetId;
        while (curr !== this._editor.getRootBlockId()) {
            if (curr === blockId) return false;
            const block = await this._editor.getBlockById(curr);
            curr = block.parentId;
        }
        return true;
    }

    private async _handleDropBlock(event: React.DragEvent<Element>) {
        if (this._blockDragDirection !== BlockDropPlacement.none) {
            const blockId = event.dataTransfer.getData(this._blockIdKey);
            if (!(await this._canBeDrop(event))) return;
            if (this._blockDragDirection === BlockDropPlacement.bottom) {
                this._editor.commands.blockCommands.moveBlockAfter(
                    blockId,
                    this._blockDragTargetId
                );
            }
            if (
                [BlockDropPlacement.left, BlockDropPlacement.right].includes(
                    this._blockDragDirection
                )
            ) {
                await this._editor.commands.blockCommands.createLayoutBlock(
                    blockId,
                    this._blockDragTargetId,
                    this._blockDragDirection === BlockDropPlacement.left
                        ? GridDropType.left
                        : GridDropType.right
                );
            }
        }
    }

    private async _handleDropGroup(event: React.DragEvent<Element>) {
        const blockId = event.dataTransfer.getData(this._blockIdKey);
        const toGroup = await this._editor.getGroupBlockByPoint(
            new Point(event.clientX, event.clientY)
        );
        if (toGroup && blockId && toGroup.id !== blockId) {
            const fromGroup = await this._editor.getBlockById(blockId);
            if (fromGroup) {
                const direction = await this.checkDragGroupDirection(
                    fromGroup,
                    toGroup,
                    new Point(event.clientX, event.clientY)
                );
                direction === GroupDirection.down
                    ? this._editor.commands.blockCommands.moveBlockAfter(
                          blockId,
                          toGroup.id
                      )
                    : this._editor.commands.blockCommands.moveBlockBefore(
                          blockId,
                          toGroup.id
                      );
            }
        }
    }

    public isEnabled() {
        return this._enabled;
    }

    public enableDragDrop(enabled: boolean) {
        this._enabled = enabled;
    }

    public disableDragDrop(disable: boolean) {
        this._enabled = false;
    }

    public setDragBlockInfo(event: React.DragEvent<Element>, blockId: string) {
        this.dragType = this.dragActions.dragBlock;
        event.dataTransfer.setData(
            this._dragActions.dragBlock,
            this.dragActions.dragBlock
        );
        event.dataTransfer.setData(this._blockIdKey, blockId);
        event.dataTransfer.setData(
            this._rootIdKey,
            this._editor.getRootBlockId()
        );
    }

    /**
     *
     *  Drag data store's dragover event is Protected mode.
     * Drag over can not get dataTransfer value by event.dataTransfer.
     * @param {React.DragEvent<Element>} [event]
     * @return {*}
     * @memberof DragDropManager
     */
    public isDragBlock(event: React.DragEvent<Element>) {
        return event.dataTransfer.types.includes(
            this.dragActions.dragBlock.toLowerCase()
        );
    }

    public setDragGroupInfo(event: React.DragEvent<Element>, blockId: string) {
        this.dragType = this.dragActions.dragGroup;
        event.dataTransfer.setData(
            this._dragActions.dragGroup,
            this.dragActions.dragGroup
        );
        event.dataTransfer.setData(this._blockIdKey, blockId);
        event.dataTransfer.setData(
            this._rootIdKey,
            this._editor.getRootBlockId()
        );
    }

    /**
     *
     *  Drag data store's dragover event is Protected mode.
     * Drag over can not get dataTransfer value by event.dataTransfer.
     * @param {React.DragEvent<Element>} [event]
     * @return {*}
     * @memberof DragDropManager
     */
    public isDragGroup(event: React.DragEvent<Element>) {
        return event.dataTransfer.types.includes(
            this.dragActions.dragGroup.toLowerCase()
        );
    }

    public async checkBlockDragTypes(
        event: React.DragEvent<Element>,
        blockDom: HTMLElement,
        blockId: string
    ) {
        const { clientX, clientY } = event;
        this._setBlockDragTargetId(blockId);

        const mousePoint = new Point(clientX, clientY);
        const rect = domToRect(blockDom);
        let direction = BlockDropPlacement.bottom;
        if (mousePoint.x - rect.left <= this._dragBlockHotDistance) {
            direction = BlockDropPlacement.left;
        }
        if (rect.right - mousePoint.x <= this._dragBlockHotDistance) {
            direction = BlockDropPlacement.right;
        }
        if (!rect.isContainPoint(mousePoint)) {
            direction = BlockDropPlacement.none;
        }
        if (!(await this._canBeDrop(event))) {
            direction = BlockDropPlacement.none;
        }
        if (
            direction === BlockDropPlacement.left ||
            direction === BlockDropPlacement.right
        ) {
            const path = await this._editor.getBlockPath(blockId);
            const gridBlocks = path.filter(block => block.type === 'grid');
            // limit grid block floor counts
            if (gridBlocks.length >= MAX_GRID_BLOCK_FLOOR) {
                direction = BlockDropPlacement.none;
            }
        }
        this._setBlockDragDirection(direction);
        return direction;
    }

    public handlerEditorDrop(event: React.DragEvent<Element>) {
        event.preventDefault();
        // IMP: can not use Decorators now may use decorators is right
        if (this.isEnabled()) {
            if (this.isDragBlock(event)) {
                this._handleDropBlock(event);
            }
            if (this.isDragGroup(event)) {
                this._handleDropGroup(event);
            }
        }
        this.dragType = undefined;
    }

    public handlerEditorDragOver(event: React.DragEvent<Element>) {
        // IMP: can not use Decorators now
    }

    public handlerEditorDragEnd(event: React.DragEvent<Element>) {
        this._resetDragDropData();
        if (this.isOnDrag) {
            this.isOnDrag = false;
        }
        if (this.isEnabled()) {
            // TODO: handle drag end event flow
        }
    }

    private _resetDragDropData() {
        this._dragType = undefined;
        this._setBlockDragDirection(BlockDropPlacement.none);
        this._setBlockDragTargetId(undefined);
    }

    public clearDropInfo() {
        this._setBlockDragDirection(BlockDropPlacement.none);
        this._setBlockDragTargetId(undefined);
    }

    public async checkDragGroupDirection(
        groupBlock: AsyncBlock,
        dragOverGroup: AsyncBlock,
        mousePoint: Point
    ) {
        let direction = GroupDirection.down;
        if (groupBlock && dragOverGroup && dragOverGroup.dom) {
            const preBlock = await dragOverGroup.previousSibling();
            const nextBlock = await dragOverGroup.nextSibling();
            let isSibling = false;
            if (preBlock?.id === groupBlock.id) {
                direction = GroupDirection.down;
                isSibling = true;
            }
            if (nextBlock?.id === groupBlock.id) {
                direction = GroupDirection.up;
                isSibling = true;
            }
            if (!isSibling) {
                const dragOverGroupRect = domToRect(dragOverGroup.dom);
                if (
                    mousePoint.y <
                    dragOverGroupRect.top + dragOverGroupRect.height / 2
                ) {
                    direction = GroupDirection.up;
                } else {
                    direction = GroupDirection.down;
                }
            }
        }
        return direction;
    }

    public onDragStateChange(cb: (isOnDrag: boolean) => void) {
        this._events.on(DRAG_STATE_CHANGE_EVENT_KEY, cb);
    }

    public offDragStateChange(cb: (isOnDrag: boolean) => void) {
        this._events.off(DRAG_STATE_CHANGE_EVENT_KEY, cb);
    }

    public dispose() {
        this._events.removeAllListeners();
    }
}
