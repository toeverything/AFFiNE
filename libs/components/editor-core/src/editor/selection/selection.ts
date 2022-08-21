/* eslint-disable max-lines */
import {
    debounce,
    domToRect,
    getBlockIdByDom,
    last,
    Point,
    Rect,
    without,
} from '@toeverything/utils';
import EventEmitter from 'eventemitter3';

import { Protocol } from '@toeverything/datasource/db-service';
import { BlockEditor } from '../..';
import { AsyncBlock } from '../block';
import { VirgoSelection } from '../types';
import {
    AsyncBlockList,
    changeEventName,
    CursorTypes,
    IdList,
    SelectBlock,
    selectEndEventName,
    SelectEventCallbackTypes,
    SelectEventTypes,
    SelectInfo,
    SelectionSettings,
    SelectionSettingsMap,
    SelectionTypes,
    SelectPosition,
} from './types';
import { isLikeBlockListIds } from './utils';
// IMP: maybe merge active and select into single function

export type SelectionInfo = InstanceType<
    typeof SelectionManager
>['currentSelectInfo'];

export class SelectionManager implements VirgoSelection {
    private _editor: BlockEditor;
    private _events = new EventEmitter();
    private _anchorNode?: AsyncBlock;
    private _focusNode?: AsyncBlock;
    private _browserSelection?: Selection;
    private _lastPoint?: CursorTypes;
    // TODO check if it is correct
    private _scrollDelay = 150;
    private _selectEndDelayTime = 500;
    private _hasEmitEndPending = false;
    private _scrollTimer: number | null = null;
    /**
     *
     * the selection info before current
     * @private
     */
    private _lastSelectionInfo?: SelectionInfo;

    /**
     *
     * last active block info for cache
     * @private
     */
    private _lastActiveSelectInfo: {
        type: SelectionTypes;
        info: SelectionSettings;
    };

    private _activatedNodeId: string;
    private _selectedNodesIds: IdList = [];
    private _selectedNodesList: AsyncBlockList = [];

    constructor(editor: BlockEditor) {
        this._editor = editor;
        this._activatedNodeId = editor.getRootBlockId();
        this._lastSelectionInfo = undefined;
        this._lastActiveSelectInfo = {
            type: 'None',
            info: null,
        };
        this._initWindowSelectionChangeListen();
    }

    /**
     *
     * current select`s type
     * @readonly
     * @memberof SelectionManager
     */
    get type() {
        if (this._selectedNodesIds.length) {
            return 'Block';
        }

        if (window.getSelection()?.type === 'None') {
            return 'None';
        }

        if (window.getSelection()?.type === 'Caret' && this._anchorNode) {
            return 'Caret';
        }

        if (window.getSelection()?.type === 'Range' && this._anchorNode) {
            return 'Range';
        }
        return 'None';
    }

    /**
     *
     * current select info
     * @readonly
     * @memberof SelectionManager
     */
    get currentSelectInfo() {
        if (this.type === 'Range' || this.type === 'Caret') {
            //TODO IMP: Do you need to pass Range and Crate directly here
            return {
                type: 'Range',
                anchorNode: this._anchorNode,
                focusNode: this._focusNode,
                browserSelection: this._browserSelection,
            } as const;
        }
        if (this.type === 'Block') {
            return {
                type: 'Block',
                selectedNodesIds: this._selectedNodesIds,
            } as const;
        }
        return { type: 'None' } as const;
    }

    get lastSelectionInfo() {
        return this._lastSelectionInfo;
    }

    get lastPoint() {
        return this._lastPoint || 'end';
    }

    /**
     *
     * listen selection in window
     * @private
     * @memberof SelectionManager
     */
    private _initWindowSelectionChangeListen() {
        document.addEventListener(
            'selectionchange',
            this._windowSelectionChangeHandler
        );
    }

    private _windowSelectionChangeHandler = async (e: Event) => {
        const selection = window.getSelection();
        await this._editor.selectionManager.setSelectedNodesIds([]);
        const { type, anchorNode, focusNode } = selection;
        if (type !== 'None' && anchorNode && focusNode) {
            const anchorNodeId = getBlockIdByDom(anchorNode);
            const focusNodeId = getBlockIdByDom(focusNode);
            const anchorBlock = await this._editor.getBlockById(
                anchorNodeId || ''
            );
            const focusBlock = await this._editor.getBlockById(
                focusNodeId || ''
            );
            if (anchorBlock && focusBlock) {
                this._anchorNode = anchorBlock;
                this._focusNode = focusBlock;
                if (selection.isCollapsed) {
                    this.setActivatedNodeId(anchorBlock.id);
                }
            }
            this._browserSelection = selection;
            const currentSelectionInfo = this.currentSelectInfo;
            this._emitSelectionChange();
            this._lastSelectionInfo = currentSelectionInfo;
        } else {
            this._anchorNode = undefined;
            this._focusNode = undefined;
            this._browserSelection = undefined;
            if (this.type !== 'Block') {
                const currentSelectionInfo = this.currentSelectInfo;
                this._emitSelectionChange();
                this._lastSelectionInfo = currentSelectionInfo;
            }
        }
    };

    public getActivatedNodeId() {
        return this._activatedNodeId;
    }

    public async setActivatedNodeId(nodeId: string) {
        const node = await this._editor.getBlockById(nodeId);
        if (node) {
            this._activatedNodeId = nodeId;
        }
    }

    get selectedNodesList() {
        return this._selectedNodesList;
    }

    set selectedNodesList(nodeList: AsyncBlockList) {
        const newSelectedNodesIds = nodeList.map(node => node.id);
        if (!isLikeBlockListIds(newSelectedNodesIds, this._selectedNodesIds)) {
            const nodesNeedUnselect = without(
                this._selectedNodesIds,
                ...newSelectedNodesIds
            );
            this._emitBlockSelect(nodesNeedUnselect, false);
            this._selectedNodesIds = newSelectedNodesIds;
            this._selectedNodesList = nodeList;
            this._emitBlockSelect(this._selectedNodesIds);
            const currentSelectionInfo = this.currentSelectInfo;
            this._emitSelectionChange();
            this._lastSelectionInfo = currentSelectionInfo;
            this.setActivatedNodeId('');
        }
    }

    getSelectedNodesIds() {
        return this._selectedNodesIds;
    }

    public async setSelectedNodesIds(nodesIdsList: IdList) {
        if (!isLikeBlockListIds(nodesIdsList, this._selectedNodesIds)) {
            const ids: IdList = [];
            const nodeList: AsyncBlockList = [];
            for (const id of nodesIdsList) {
                const node = await this._editor.getBlockById(id);
                if (node) {
                    ids.push(id);
                    nodeList.push(node);
                }
            }
            const blockNeedUnselect = without(this._selectedNodesIds, ...ids);
            this._emitBlockSelect(blockNeedUnselect, false);
            this._selectedNodesIds = ids;
            this._selectedNodesList = nodeList;
            this._emitBlockSelect(this._selectedNodesIds);
            const currentSelectionInfo = this.currentSelectInfo;
            this._emitSelectionChange();
            this._lastSelectionInfo = currentSelectionInfo;
            this.setActivatedNodeId('');
        }
    }

    /**
     *
     * select all level1 classes
     * @memberof SelectionManager
     */
    public async selectAllBlocks() {
        const rootBlockId = this._editor.getRootBlockId();
        const rootBlock = await this._editor.getBlockById(rootBlockId);
        const children = await rootBlock?.children();
        if (children) {
            this.setSelectedNodesIds(children.map(({ id }) => id));
            // blur focused element and blur it
            (document?.activeElement as HTMLInputElement)?.blur();
        }
    }

    /**
     *
     * get all block list
     * @private
     * @return {*}  {Promise<Array<AsyncBlock>>}
     * @memberof SelectionManager
     */
    public getLastActiveSelectionSetting<
        T extends keyof SelectionSettingsMap
    >() {
        const { type, info } = this._lastActiveSelectInfo as {
            type: T;
            info: SelectionSettingsMap[T];
        };
        return {
            nodeId: this._activatedNodeId || '',
            type,
            info,
        };
    }

    public async rootDomReady() {
        const rootBlockId = this._editor.getRootBlockId();
        const rootBlock = await this._editor.getBlockById(rootBlockId);
        return Boolean(rootBlock?.dom);
    }

    public async isPointInBlocks(point: Point) {
        return Boolean(this._editor.getBlockByPoint(point));
    }

    /**
     *
     * get witch nodes intersect with selected rect
     * @param {Rect} selectionRect
     * @param {AsyncBlock} [block]
     * @return {*}
     * @memberof SelectionManager
     */
    public async calcRenderBlockIntersect(
        selectionRect: Rect,
        block?: AsyncBlock
    ) {
        const selectedNodes: Array<AsyncBlock> = [];
        if (!block) {
            const rootBlockId = this._editor.getRootBlockId();
            const rootBlock = await this._editor.getBlockById(rootBlockId);
            if (rootBlock) {
                block = rootBlock;
            }
        }
        if (block && block.dom) {
            if (selectionRect.isIntersect(domToRect(block.dom))) {
                const childrenBlocks = await block.children();
                // should check directly in structured block
                const structuredChildrenBlocks: Array<AsyncBlock> =
                    childrenBlocks.filter(childBlock => {
                        return this._editor.getView(childBlock.type).layoutOnly;
                    });
                for await (const childBlock of structuredChildrenBlocks) {
                    const childSelectedNodes =
                        await this.calcRenderBlockIntersect(
                            selectionRect,
                            childBlock
                        );
                    selectedNodes.push(...childSelectedNodes);
                }
                const selectableChildren = childrenBlocks.filter(childBlock => {
                    return this._editor.getView(childBlock.type).selectable;
                });
                for await (const childBlock of selectableChildren) {
                    const { dom } = childBlock;
                    if (!dom) {
                        console.warn('can not find dom bind with block');
                    }
                    if (dom && selectionRect.isIntersect(domToRect(dom))) {
                        selectedNodes.push(childBlock);
                    }
                }
                // if just only has one selected maybe select the children
                if (selectedNodes.length === 1) {
                    const childrenSelectedNodes: Array<AsyncBlock> =
                        await this.calcRenderBlockIntersect(
                            selectionRect,
                            selectedNodes[0]
                        );
                    if (childrenSelectedNodes.length)
                        return childrenSelectedNodes;
                }
            }
        }
        return selectedNodes;
    }

    /**
     *
     * convert selected nodes to group,
     * group is still a special block`s type.
     * @memberof SelectionManager
     */
    public async convertSelectedNodesToGroup(nodes = this._selectedNodesList) {
        if (nodes && nodes.length) {
            const groupBlock = await this._editor.createBlock('group');
            // IMP: if check nodes are level1
            const lastNode = last(nodes);
            if (groupBlock) {
                await lastNode?.after(groupBlock);
                for (const node of nodes) {
                    await node.remove();
                }
                await groupBlock.prepend(...nodes);
                // cache
                this.selectedNodesList = [groupBlock];
            }
        }
    }

    /**
     *
     * remove group block by Id
     * @param {string} blockId
     * @memberof SelectionManager
     */
    public async removeGroup(blockId: string) {
        const groupBlock = await this._editor.getBlockById(blockId);
        if (groupBlock?.type === Protocol.Block.Type.group) {
            const children = await groupBlock.children();
            if (children && children.length) {
                const previousBlock = await groupBlock.previousSibling();
                await groupBlock.remove();
                for (const node of children) {
                    await node.remove();
                }
                if (previousBlock) {
                    await previousBlock.after(...children);
                } else {
                    const parentNode = await groupBlock.parent();
                    await parentNode.append(...children);
                }
            }
        }
    }

    /**
     *
     * get previous activatable blockNode
     * @private
     * @param {AsyncBlock} node
     * @return {*}  {(Promise<AsyncBlock | null>)}
     * @memberof SelectionManager
     */
    private async _getPreviousActivatableBlockNode(
        node: AsyncBlock
    ): Promise<AsyncBlock | null> {
        const preNode = await node.physicallyPerviousSibling();
        // exit when find no preNode
        if (!preNode) {
            return null;
        }
        const { activatable, selectable } = this._editor.getView(preNode.type);
        if (activatable) {
            this.setSelectedNodesIds([]);
            return preNode;
        }
        if (selectable) {
            this.setSelectedNodesIds([preNode.id]);
            (document.activeElement as HTMLInputElement)?.blur();
            return null;
        }
        return this._getPreviousActivatableBlockNode(preNode);
    }

    /**
     *
     * get next activatable blockNode
     * @private
     * @param {AsyncBlock} node
     * @return {*}  {(Promise<AsyncBlock | null>)}
     * @memberof SelectionManager
     */
    private async _getNextActivatableBlockNode(
        node: AsyncBlock,
        ignoreSelf = true
    ): Promise<AsyncBlock | null> {
        // if preNode is not parent level check if next block has selectable children
        const children = await node.children();
        let nextNode: AsyncBlock | null = null;

        // if has children first check children
        if (children && children.length) {
            nextNode = children[0];
        } else {
            const nextSibling = await node.nextSibling();

            if (nextSibling) {
                nextNode = nextSibling;
            }

            let parentNode = await node.parent();
            // if do not has next sibling block search for paren levels next
            if (parentNode) {
                while (!nextNode) {
                    if (parentNode.id === this._editor.getRootBlockId()) {
                        return null;
                    }
                    const parentNext = await parentNode.nextSibling();
                    if (parentNext) {
                        nextNode = parentNext;
                    } else {
                        parentNode = await parentNode.parent();
                    }
                }
            }

            if (!nextNode || node.id === this._editor.getRootBlockId()) {
                return null;
            }
        }

        const { activatable, selectable } = this._editor.getView(nextNode.type);
        if (activatable) {
            this.setSelectedNodesIds([]);
            return nextNode;
        }
        if (selectable) {
            this.setSelectedNodesIds([nextNode.id]);
            (document.activeElement as HTMLInputElement)?.blur();
            return null;
        }
        return this._getNextActivatableBlockNode(nextNode);
    }

    /**
     *
     * make pervious or parent node be focused
     * @param {string} nodeId
     * @memberof SelectionManager
     */
    public async activePreviousNode(nodeId?: string, position?: CursorTypes) {
        const id = nodeId || this._activatedNodeId;
        const node = await this._editor.getBlockById(id);
        if (node) {
            let preNode: AsyncBlock;
            if (node.type === Protocol.Block.Type.group) {
                preNode = await node.previousSibling();
                if (preNode) {
                    this.setSelectedNodesIds([preNode.id]);
                    return;
                }
            }
            preNode = await this._getPreviousActivatableBlockNode(node);
            if (preNode) {
                this.activeNodeByNodeId(preNode.id, position);
            }
        } else {
            console.warn('Can not find node by this id');
        }
    }

    /**
     *
     * get previous selectable block
     * @private
     * @param {AsyncBlock} node
     * @return {*}  {(Promise<AsyncBlock | null>)}
     * @memberof SelectionManager
     */
    private async _getPreviousBlockForSelect(
        node: AsyncBlock
    ): Promise<AsyncBlock | null> {
        let preNode = await node.previousSibling();
        // if preNode is not parent level check if previous block has selectable children
        if (!preNode) {
            preNode = await node.parent();
        }
        // exit when find root block
        if (!preNode || preNode.id === this._editor.getRootBlockId()) {
            return null;
        }
        const { selectable } = this._editor.getView(preNode.type);
        if (selectable) {
            (document.activeElement as HTMLInputElement)?.blur();
            return preNode;
        }
        return this._getPreviousBlockForSelect(preNode);
    }

    public async getPreviousNodeId(nodeId: string): Promise<string> {
        const node = await this._editor.getBlockById(nodeId);
        if (node) {
            const preNode = await this._getPreviousBlockForSelect(node);
            return preNode?.id || '';
        } else {
            console.warn('Can not find node by this id');
            return '';
        }
    }

    public async expandBlockSelect(isPrevious: boolean) {
        if (this.type === 'Block') {
            let newNodeId = '';
            if (isPrevious) {
                newNodeId = await this.getPreviousNodeId(
                    this._selectedNodesIds[0]
                );
            } else {
                newNodeId = await this._editor.selectionManager.getNextNodeId(
                    this._selectedNodesIds[0]
                );
            }
            if (newNodeId) {
                if (this._selectedNodesIds.indexOf(newNodeId) !== -1) {
                    this._editor.selectionManager.setSelectedNodesIds(
                        this._selectedNodesIds.slice(1)
                    );
                } else {
                    const new_node = await this._editor.getBlockById(newNodeId);
                    if (new_node) {
                        const new_node_children_ids =
                            await new_node.childrenIds;
                        let select_ids_new = this._selectedNodesIds;
                        if (
                            new_node_children_ids &&
                            new_node_children_ids.length
                        ) {
                            select_ids_new = select_ids_new = without(
                                select_ids_new,
                                ...new_node_children_ids
                            );
                        }
                        this.setSelectedNodesIds([
                            newNodeId,
                            ...select_ids_new,
                        ]);
                    }
                }
            }
        }
    }

    /**
     *
     * make next or next children node be focused
     * @param {string} nodeId
     * @memberof SelectionManager
     */
    public async activeNextNode(nodeId?: string, position?: CursorTypes) {
        const id = nodeId || this._activatedNodeId;
        const node = await this._editor.getBlockById(id);
        if (node) {
            let nextNode: AsyncBlock;
            if (node.type === Protocol.Block.Type.group) {
                nextNode = await node.nextSibling();
                if (nextNode) {
                    this.setSelectedNodesIds([nextNode.id]);
                    return false;
                }
            }

            nextNode = await this._getNextActivatableBlockNode(node);
            if (nextNode) {
                this.activeNodeByNodeId(nextNode.id, position);
            }
            return false;
        } else {
            console.warn('Can not find node by this id');
            return false;
        }
    }

    private async _getNextBlockForSelect(
        node: AsyncBlock
    ): Promise<AsyncBlock | null> {
        let nextNode: AsyncBlock | null = null;

        const nextSibling = await node.nextSibling();

        if (nextSibling) {
            nextNode = nextSibling;
        }

        if (!nextNode) {
            nextNode = await (await node.parent())?.nextSibling();
        }

        if (!nextNode || node.id === this._editor.getRootBlockId()) {
            return null;
        }

        const { selectable } = this._editor.getView(nextNode.type);

        if (selectable) {
            (document.activeElement as HTMLInputElement)?.blur();
            return nextNode;
        }
        return this._getNextBlockForSelect(nextNode);
    }

    public async getNextNodeId(nodeId: string): Promise<string> {
        const node = await this._editor.getBlockById(nodeId);
        if (node) {
            const nextNode = await this._getNextBlockForSelect(node);
            return nextNode ? nextNode.id : '-1';
        } else {
            console.warn('Can not find node by this id');
            return '-1';
        }
    }

    /**
     *
     * focus node by node id
     * @param {string} nodeId
     * @memberof SelectionManager
     */
    public async activeNodeByNodeId(nodeId: string, position?: CursorTypes) {
        try {
            if (this._scrollTimer) {
                clearTimeout(this._scrollTimer);
            }
            const node = await this._editor.getBlockById(nodeId);
            if (node) {
                this._activatedNodeId = nodeId;
                if (position) {
                    this._lastPoint = position;
                }
                this.emit(nodeId, SelectEventTypes.active, this.lastPoint);
                // TODO: Optimize the related logic after implementing the scroll bar
                this._scrollTimer = window.setTimeout(() => {
                    this._editor.scrollManager.keepBlockInView(node);
                }, this._scrollDelay);
            } else {
                console.warn('Can not find node by this id');
            }
        } catch (e) {
            console.warn('Some error occured in activeNodeByNodeId');
        }
    }

    /**
     *
     * active and set a block`s selection
     * @template T
     * @param {string} nodeId
     * @param {{
     *             type: T;
     *             info: SelectionSettingsMap[T];
     *         }} [selectionInfo]
     * @memberof SelectionManager
     */
    public async setNodeActiveSelection<T extends keyof SelectionSettingsMap>(
        nodeId: string,
        selectionInfo?: {
            type: T;
            info: SelectionSettingsMap[T];
        }
    ) {
        const node = await this._editor.getBlockById(nodeId);
        if (node) {
            this._activatedNodeId = nodeId;
            this.emit(
                nodeId,
                SelectEventTypes.setSelection,
                selectionInfo?.info || null
            );
            // TODO: Optimize the related logic after implementing the scroll bar
            setTimeout(() => {
                // node.dom?.scrollIntoView();
            }, this._scrollDelay);
        } else {
            console.warn('Can not find node by this id');
        }
    }

    private _toEventName(blockId: string, eventType: SelectEventTypes) {
        return `${blockId}_${eventType}`;
    }

    /**
     *
     * notice selected blocks, select status had been changed
     * @private
     * @param {Array<string>} nodeIdList
     * @param {boolean} [isSelect=true]
     * @memberof SelectionManager
     */
    private _emitBlockSelect(nodeIdList: Array<string>, isSelect = true) {
        if (nodeIdList && nodeIdList.length) {
            nodeIdList.forEach(id => {
                this.emit(id, SelectEventTypes.onSelect, isSelect);
            });
        }
    }

    public emit<T extends SelectEventTypes>(
        blockId: string,
        eventType: T,
        ...eventParams: SelectEventCallbackTypes[T] | []
    ) {
        this._events.emit(
            this._toEventName(blockId, eventType),
            ...eventParams
        );
    }

    public onSelectionChange(handler: (selectionInfo: SelectionInfo) => void) {
        this._events.on(changeEventName, handler);
    }

    public unBindSelectionChange(
        handler: (selectionInfo: SelectionInfo) => void
    ) {
        this._events.off(changeEventName, handler);
    }

    public observe(
        nodeId: string,
        eventType: SelectEventTypes,
        callback: (...args: Array<any>) => void
    ) {
        this._events.on(this._toEventName(nodeId, eventType), callback);
    }

    public unobserve(
        nodeId: string,
        eventType: SelectEventTypes,
        callback: (...args: Array<any>) => void
    ) {
        this._events.off(this._toEventName(nodeId, eventType), callback);
    }

    private _emitSelectionEnd = debounce(() => {
        this._events.emit(selectEndEventName, this.currentSelectInfo);
    }, this._selectEndDelayTime);

    private _emitSelectionChange() {
        this._events.emit(changeEventName, this.currentSelectInfo);
        this._maybeEmitSelectEnd();
    }

    private _maybeEmitSelectEnd() {
        if (this._editor.mouseManager.isMouseDown) {
            if (!this._hasEmitEndPending) {
                this._hasEmitEndPending = true;
                this._editor.mouseManager.onMouseupEventOnce(() => {
                    this._emitSelectionEnd();
                    this._hasEmitEndPending = false;
                });
            }
        } else {
            this._emitSelectionEnd();
        }
    }

    /**
     *
     * check if current selection is single cursor
     * @memberof SelectionManager
     */
    public isCollapsed() {
        if (this.currentSelectInfo.type === 'Range') {
            return this.currentSelectInfo.browserSelection?.isCollapsed;
        }
        return false;
    }

    /**
     *
     * add listener select info start
     * @param {(info: SelectionInfo) => void} cb
     * @memberof SelectionManager
     */
    public onSelectEnd(cb: (info: SelectionInfo) => void) {
        this._events.on(selectEndEventName, cb);
        return this.offSelectEnd.bind(this, cb);
    }

    /**
     *
     * off listener select info end
     * @param {(info: SelectionInfo) => void} cb
     * @memberof SelectionManager
     */
    public offSelectEnd(cb: (info: SelectionInfo) => void) {
        this._events.off(selectEndEventName, cb);
    }

    // TODO: does not consider discontinuous situations (such as multi-selection or hidden block scenarios), the product does not have this feature yet
    public async getSelectInfo(): Promise<SelectInfo> {
        const selectInfo = this.currentSelectInfo;
        const startBlockId = await this._getFirstBlockId(selectInfo);
        const endBlockId = await this._getLastBlockId(selectInfo);
        let startPosition: SelectPosition = null;
        let endPosition: SelectPosition = null;
        if (selectInfo.type === 'Range') {
            const selRange = selectInfo.browserSelection.getRangeAt(0);
            const startIndex = this._getTextNodeIndex(selRange.startContainer);
            if (startIndex !== -1) {
                startPosition = {
                    arrayIndex: startIndex,
                    offset: selRange.startOffset,
                };
            }
            const endIndex = this._getTextNodeIndex(selRange.endContainer);
            if (endIndex !== -1) {
                endPosition = {
                    arrayIndex: endIndex,
                    offset: selRange.endOffset,
                };
            }
        }
        let select: SelectInfo = {
            type: 'None',
            blocks: [],
        };
        if (!startBlockId || !endBlockId) {
            return select;
        }

        const blocks: SelectBlock[] = [];
        const blockId = startBlockId;
        let beenFind = false;
        let curBlock = await this._editor.getBlockById(blockId);
        while (!beenFind && curBlock) {
            beenFind = await this._collectBlockInfo(
                curBlock,
                startBlockId,
                endBlockId,
                startPosition,
                endPosition,
                blocks
            );
            if (beenFind) {
                break;
            }
            let parent = curBlock;
            curBlock = null;
            while (parent) {
                const nextSibling = await parent.nextSibling();
                if (nextSibling) {
                    curBlock = nextSibling;
                    break;
                }
                parent = await parent.parent();
            }
        }

        select = {
            type: selectInfo.type,
            blocks: blocks,
        };
        return select;
    }

    private async _collectBlockInfo(
        block: AsyncBlock,
        startId: string,
        endId: string,
        startPosition: SelectPosition,
        endPosition: SelectPosition,
        blocks: SelectBlock[]
    ) {
        const selectBlock: SelectBlock = {
            blockId: block.id,
            children: [] as any[],
        };

        if (block.id === startId && startPosition) {
            selectBlock.startInfo = startPosition;
        }

        if (block.id === endId && endPosition) {
            selectBlock.endInfo = endPosition;
        }

        blocks.push(selectBlock);

        let beenFindEnd = block.id === endId;
        if (!beenFindEnd) {
            for (let i = 0; i < block.childrenIds.length; i++) {
                const nextBlock = await this._editor.getBlockById(
                    block.childrenIds[i]
                );
                beenFindEnd = await this._collectBlockInfo(
                    nextBlock,
                    startId,
                    endId,
                    startPosition,
                    endPosition,
                    selectBlock.children
                );
                if (beenFindEnd) {
                    break;
                }
            }
        }

        return beenFindEnd;
    }

    // Get the text node index position
    private _getTextNodeIndex(node: Node) {
        const paragraph = node?.parentElement?.closest('.text-paragraph');
        const slate = node?.parentElement?.closest('[data-slate-node]');

        if (paragraph) {
            for (let i = 0; i < paragraph.childNodes.length; i++) {
                if (paragraph.childNodes[i] === slate) {
                    return i;
                }
            }
        }
        return -1;
    }

    private async _getFirstBlockId(selectInfo: any) {
        let blockId = '';
        if (selectInfo.type === 'Block') {
            if (selectInfo.selectedNodesIds?.length === 0) {
                return blockId;
            }

            blockId = selectInfo.selectedNodesIds[0];
            let nextBlockId = blockId;
            while (
                nextBlockId &&
                selectInfo.selectedNodesIds.indexOf(nextBlockId) !== 0
            ) {
                blockId = nextBlockId;
                nextBlockId = await this.getPreviousNodeId(blockId);
            }
        } else if (selectInfo.type === 'Range') {
            const selRange = selectInfo.browserSelection?.getRangeAt(0);
            blockId =
                selRange.startContainer?.parentElement
                    ?.closest('[data-block-id]')
                    ?.attributes.getNamedItem('data-block-id')?.value || '';
        }
        return blockId && blockId !== '-1' ? blockId : '';
    }

    private async _getLastBlockId(selectInfo: any) {
        let blockId = '';
        if (selectInfo.type === 'Block') {
            if (selectInfo.selectedNodesIds?.length === 0) {
                return blockId;
            }

            blockId =
                selectInfo.selectedNodesIds[
                    selectInfo.selectedNodesIds.length - 1
                ];
            let nextBlockId = blockId;
            while (
                nextBlockId &&
                selectInfo.selectedNodesIds.indexOf(nextBlockId) !== -1
            ) {
                blockId = nextBlockId;
                nextBlockId = await this.getNextNodeId(blockId);
            }

            let block = await this._editor.getBlockById(blockId);
            while (block) {
                blockId = block.id;
                block = await block.lastChild();
            }
        } else if (selectInfo.type === 'Range') {
            const selRange = selectInfo.browserSelection?.getRangeAt(0);
            blockId =
                selRange.endContainer?.parentElement
                    ?.closest('[data-block-id]')
                    ?.attributes.getNamedItem('data-block-id')?.value || '';
        }
        return blockId && blockId !== '-1' ? blockId : '';
    }

    /**
     *
     * make this function always in the end of this class
     * @memberof SelectionManager
     */
    public dispose() {
        document.removeEventListener(
            'selectionchange',
            this._windowSelectionChangeHandler
        );
    }
    /**
     *
     * move active selection to the new position
     * @param {number} index
     * @param {string} blockId
     * @memberof SelectionManager
     */
    public async moveCursor(
        nowRange: any,
        index: number,
        blockId: string
    ): Promise<void> {
        const preRang = document.createRange();
        preRang.setStart(nowRange.startContainer, index);
        preRang.setEnd(nowRange.endContainer, index);
        const prePosition = preRang.getClientRects().item(0);
        this.activeNodeByNodeId(
            blockId,
            new Point(prePosition.left, prePosition.bottom)
        );
    }
}
