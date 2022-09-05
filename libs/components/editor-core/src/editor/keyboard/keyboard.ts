import HotKeys from 'hotkeys-js';

import { uaHelper } from '@toeverything/utils';

import { Protocol } from '@toeverything/datasource/db-service';
import { AsyncBlock, BlockEditor } from '../..';
import { supportChildren } from '../../utils';
import { SelectionManager } from '../selection';
import {
    GlobalHotkeyMap,
    GlobalMacHotkeyMap,
    GlobalWinHotkeyMap,
    HotkeyMap,
    HotKeyTypes,
    MacHotkeyMap,
    WinHotkeyMap,
} from './hotkey-map';
type KeyboardEventHandler = (event: KeyboardEvent) => void;
export class KeyboardManager {
    private _editor: BlockEditor;
    private selection_manager: SelectionManager;
    private hotkeys: HotkeyMap;
    private global_hotkeys: GlobalHotkeyMap;
    private handler_map: { [k: string]: Array<KeyboardEventHandler> };
    /**
     * Every editor should have its own hotkey scope,
     * but edgeless had multiple editor instances,
     * all edgeless editors should have shared scope
     */
    private hotkeyScope: string;

    constructor(editor: BlockEditor) {
        if (editor.isEdgeless) {
            // edgeless editors should have shared scope
            this.hotkeyScope = 'whiteboard';
        } else {
            this.hotkeyScope = 'editor_' + editor.getRootBlockId();
        }
        this._editor = editor;
        this.selection_manager = this._editor.selectionManager;
        if (uaHelper.isMacOs) {
            this.hotkeys = MacHotkeyMap;
            this.global_hotkeys = GlobalMacHotkeyMap;
        } else {
            this.hotkeys = WinHotkeyMap;
            this.global_hotkeys = GlobalWinHotkeyMap;
        }
        this.handler_map = {};

        HotKeys.setScope(this.hotkeyScope);

        // this.init_common_shortcut_cb();
        this.bind_hot_key_handlers();
    }

    private bind_hot_key_handlers() {
        this.bind_hotkey(
            this.hotkeys.selectAll,
            this.hotkeyScope,
            this.handle_select_all
        );

        this.bind_hotkey(this.hotkeys.undo, this.hotkeyScope, this.handle_undo);
        this.bind_hotkey(this.hotkeys.redo, this.hotkeyScope, this.handle_redo);
        this.bind_hotkey(this.hotkeys.remove, 'all', this.handle_remove);
        this.bind_hotkey(
            this.hotkeys.checkUncheck,
            this.hotkeyScope,
            this.handle_check_uncheck
        );
        this.bind_hotkey(
            this.hotkeys.preExpendSelect,
            this.hotkeyScope,
            this.handle_pre_expend_select
        );
        this.bind_hotkey(
            this.hotkeys.nextExpendSelect,
            this.hotkeyScope,
            this.handle_next_expend_select
        );
        this.bind_hotkey(
            this.hotkeys.up,
            this.hotkeyScope,
            this.handle_click_up
        );
        this.bind_hotkey(
            this.hotkeys.down,
            this.hotkeyScope,
            this.handleClickDown
        );
        this.bind_hotkey(
            this.hotkeys.left,
            this.hotkeyScope,
            this.handle_click_up
        );
        this.bind_hotkey(
            this.hotkeys.right,
            this.hotkeyScope,
            this.handleClickDown
        );
        this.bind_hotkey(
            this.hotkeys.mergeGroup,
            this.hotkeyScope,
            this.mergeGroup
        );
        this.bind_hotkey(this.hotkeys.enter, 'all', this.handleEnter);
        this.bind_hotkey(this.global_hotkeys.search, 'all', this.handle_search);
        this.bind_hotkey(
            this.hotkeys.mergeGroupDown,
            this.hotkeyScope,
            this.mergeGroupDown
        );
        this.bind_hotkey(
            this.hotkeys.mergeGroupUp,
            this.hotkeyScope,
            this.mergeGroupUp
        );
    }

    private bind_hotkey(
        key: string,
        scope: string,
        ...handler: Array<KeyboardEventHandler>
    ) {
        handler.forEach(h => {
            HotKeys(key, scope, h);
            if (!this.handler_map[key]) {
                this.handler_map[key] = [];
            }
            this.handler_map[key].push(h);
        });
    }

    /**
     *
     * emit a shortcut event，
     * need pass a new keyboard event
     * @param {HotkeyMapKeys} type
     * @param {KeyboardEventHandler} handler
     * @memberof KeyboardManager
     */
    public emit(type: HotKeyTypes, event: KeyboardEvent) {
        // this.common_handler(type, event);
        const handlers = this.handler_map[this.hotkeys[type]];
        if (handlers) {
            handlers.forEach(h => h(event));
        }
    }

    public dispose() {
        Object.entries(this.handler_map).forEach(([key, fns]) =>
            fns.forEach(fn => HotKeys.unbind(key, fn))
        );
        this.handler_map = {};
        HotKeys.deleteScope(this.hotkeyScope);
    }

    private handle_select_all = (event: KeyboardEvent) => {
        event.preventDefault();
        this.selection_manager.selectAllBlocks();
    };

    private handle_undo = (event: KeyboardEvent) => {
        event.preventDefault();
        this._editor.undo();
    };

    private handle_redo = (event: KeyboardEvent) => {
        event.preventDefault();
        this._editor.redo();
    };

    private handle_search = (event: KeyboardEvent) => {
        event.preventDefault();
        this._editor.getHooks().onSearch();
    };

    private handle_remove = (event: KeyboardEvent) => {
        const selectNode =
            this._editor.selectionManager.selectedNodesList || [];
        selectNode.forEach(node => node.remove());
    };

    private handle_check_uncheck = (event: KeyboardEvent) => {
        if (this._editor.selectionManager.getSelectedNodesIds().length !== 0) {
            this._editor.selectionManager.setSelectedNodesIds([]);
        }
    };

    private handle_pre_expend_select = (event: KeyboardEvent) => {
        this.handle_expend_select(event, true);
    };

    private handle_next_expend_select = (event: KeyboardEvent) => {
        this.handle_expend_select(event, false);
    };

    private handle_expend_select = async (
        event: KeyboardEvent,
        is_previous: boolean
    ) => {
        this._editor.selectionManager.expandBlockSelect(is_previous);
    };

    private handle_click_up = (event: Event) => {
        const selectedIds = this._editor.selectionManager.getSelectedNodesIds();
        if (selectedIds.length) {
            event.preventDefault();
            this._editor.selectionManager.activePreviousNode(
                selectedIds[0],
                'end'
            );
        }
    };
    private handleClickDown = async (event: Event) => {
        const selectedIds = this._editor.selectionManager.getSelectedNodesIds();
        if (selectedIds.length) {
            event.preventDefault();
            this._editor.selectionManager.activeNextNode(selectedIds[0], 'end');
        }
    };
    private handleEnter = async (event: Event) => {
        const selectedIds = this._editor.selectionManager.getSelectedNodesIds();
        if (selectedIds.length) {
            event.preventDefault();
            const selectedNode = await this._editor.getBlockById(
                selectedIds[0]
            );
            if (selectedNode.type === Protocol.Block.Type.group) {
                const children = await selectedNode.children();
                if (!supportChildren(children[0])) {
                    await this._editor.selectionManager.setSelectedNodesIds([
                        children[0].id,
                    ]);
                    return;
                }
                await this._editor.selectionManager.activeNodeByNodeId(
                    children[0].id
                );
            } else {
                // suspend(true)
                const textBlock = await this._editor.createBlock('text');
                await selectedNode.after(textBlock);
                this._editor.selectionManager.setActivatedNodeId(textBlock.id);
            }
        }
    };
    private mergeGroup = async (event: Event) => {
        const selectedGroup = await this.getSelectedGroups();
        this._editor.commands.blockCommands.mergeGroup(...selectedGroup);
    };
    private mergeGroupDown = async (event: Event) => {
        const selectedGroup = await this.getSelectedGroups();
        if (selectedGroup.length) {
            const nextGroup = await selectedGroup[
                selectedGroup.length - 1
            ].nextSibling();
            if (nextGroup?.type === Protocol.Block.Type.group) {
                this._editor.commands.blockCommands.mergeGroup(
                    ...selectedGroup,
                    nextGroup
                );
            }
        }
    };
    private mergeGroupUp = async (event: Event) => {
        const selectedGroup = await this.getSelectedGroups();
        if (selectedGroup.length) {
            const preGroup = await selectedGroup[0].previousSibling();
            if (preGroup?.type === Protocol.Block.Type.group) {
                this._editor.commands.blockCommands.mergeGroup(
                    preGroup,
                    ...selectedGroup
                );
            }
        }
    };
    private getSelectedGroups = async () => {
        const selectedIds = this._editor.selectionManager.getSelectedNodesIds();
        const selectedNodes = (
            await Promise.all(
                selectedIds.map(id => this._editor.getBlockById(id))
            )
        ).filter(Boolean) as AsyncBlock[];
        if (
            !selectedNodes.every(
                node => node.type === Protocol.Block.Type.group
            )
        ) {
            return [];
        }
        return selectedNodes;
    };
}
