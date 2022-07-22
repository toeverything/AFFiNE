import HotKeys from 'hotkeys-js';

import { uaHelper } from '@toeverything/utils';

import { AsyncBlock, BlockEditor } from '../..';
import { SelectionManager } from '../selection';
import {
    HotKeyTypes,
    HotkeyMap,
    MacHotkeyMap,
    WinHotkeyMap,
    GlobalHotkeyMap,
    GlobalMacHotkeyMap,
    GlobalWinHotkeyMap,
} from './hotkey-map';
import { supportChildren } from '../../utils';
import { Protocol } from '@toeverything/datasource/db-service';
type KeyboardEventHandler = (event: KeyboardEvent) => void;
export class KeyboardManager {
    private _editor: BlockEditor;
    private selection_manager: SelectionManager;
    private hotkeys: HotkeyMap;
    private global_hotkeys: GlobalHotkeyMap;
    private handler_map: { [k: string]: Array<KeyboardEventHandler> };

    constructor(editor: BlockEditor) {
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

        // WARNING: Remove the filter of hotkeys, the input event of input/select/textarea will be filtered out by default
        // When there is a problem with the input of the text component, you need to pay attention to this
        const old_filter = HotKeys.filter;
        HotKeys.filter = event => {
            let parent = (event.target as Element).parentElement;
            while (parent) {
                if (parent === editor.container) {
                    return old_filter(event);
                }
                parent = parent.parentElement;
            }

            return true;
        };
        HotKeys.setScope('editor');

        // this.init_common_shortcut_cb();
        this.bind_hot_key_handlers();
    }

    private bind_hot_key_handlers() {
        this.bind_hotkey(
            this.hotkeys.selectAll,
            'editor',
            this.handle_select_all
        );

        this.bind_hotkey(this.hotkeys.undo, 'editor', this.handle_undo);
        this.bind_hotkey(this.hotkeys.redo, 'editor', this.handle_redo);
        this.bind_hotkey(this.hotkeys.remove, 'editor', this.handle_remove);
        this.bind_hotkey(
            this.hotkeys.checkUncheck,
            'editor',
            this.handle_check_uncheck
        );
        this.bind_hotkey(
            this.hotkeys.preExpendSelect,
            'editor',
            this.handle_pre_expend_select
        );
        this.bind_hotkey(
            this.hotkeys.nextExpendSelect,
            'editor',
            this.handle_next_expend_select
        );
        this.bind_hotkey(this.hotkeys.up, 'editor', this.handle_click_up);
        this.bind_hotkey(this.hotkeys.down, 'editor', this.handleClickDown);
        this.bind_hotkey(this.hotkeys.left, 'editor', this.handle_click_up);
        this.bind_hotkey(this.hotkeys.right, 'editor', this.handleClickDown);
        this.bind_hotkey(this.hotkeys.mergeGroup, 'editor', this.mergeGroup);
        this.bind_hotkey(this.hotkeys.enter, 'all', this.handleEnter);
        this.bind_hotkey(this.global_hotkeys.search, 'all', this.handle_search);
        this.bind_hotkey(
            this.hotkeys.mergeGroupDown,
            'editor',
            this.mergeGroupDown
        );
        this.bind_hotkey(
            this.hotkeys.mergeGroupUp,
            'editor',
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
                this.handler_map[key] = [h];
            } else {
                this.handler_map[key].push(h);
            }
        });
    }

    /**
     *
     * bind global shortcut event
     * @param {HotkeyMapKeys} type
     * @param {KeyboardEventHandler} handler
     * @memberof KeyboardManager
     */
    public bind(type: HotKeyTypes, handler: KeyboardEventHandler) {
        this.bind_hotkey(this.hotkeys[type], 'editor', handler);
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

    /**
     *
     * unbind keyboard event
     * @param {HotKeyTypes} key
     * @param {KeyboardEventHandler} cb
     * @memberof KeyboardManager
     */
    public unbind(key: HotKeyTypes, cb: KeyboardEventHandler) {
        HotKeys.unbind(key, 'editor', cb);
    }

    public dispose() {
        Object.keys(this.handler_map).map(key => HotKeys.unbind(key, 'editor'));

        this.handler_map = {};
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
                let textBlock = await this._editor.createBlock('text');
                await selectedNode.after(textBlock);
                this._editor.selectionManager.setActivatedNodeId(textBlock.id);
            }
        }
    };
    private mergeGroup = async (event: Event) => {
        let selectedGroup = await this.getSelectedGroups();
        this._editor.commands.blockCommands.mergeGroup(...selectedGroup);
    };
    private mergeGroupDown = async (event: Event) => {
        let selectedGroup = await this.getSelectedGroups();
        if (selectedGroup.length) {
            let nextGroup = await selectedGroup[
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
        let selectedGroup = await this.getSelectedGroups();
        if (selectedGroup.length) {
            let preGroup = await selectedGroup[0].previousSibling();
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
