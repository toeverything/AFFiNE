export type HotKeyTypes =
    | 'selectAll'
    | 'newPage'
    | 'undo'
    | 'redo'
    | 'remove'
    | 'checkUncheck'
    | 'preExpendSelect'
    | 'nextExpendSelect'
    | 'up'
    | 'down'
    | 'left'
    | 'right'
    | 'enter'
    | 'mergeGroup'
    | 'mergeGroupUp'
    | 'mergeGroupDown';
export type HotkeyMap = Record<HotKeyTypes, string>;

/** hot key maps for mac */
export const MacHotkeyMap: HotkeyMap = {
    selectAll: 'command+a',
    newPage: 'command+n',
    undo: 'command+z',
    redo: 'command+shift+z',
    remove: 'backspace',
    checkUncheck: 'esc',
    preExpendSelect: 'shift+up',
    nextExpendSelect: 'shift+down',
    up: 'up',
    down: 'down',
    left: 'left',
    right: 'right',
    enter: 'enter',
    mergeGroupUp: 'command+up',
    mergeGroupDown: 'command+down',
    mergeGroup: 'command+m',
};

/** hot key maps for windows */
export const WinHotkeyMap: HotkeyMap = {
    selectAll: 'ctrl+a',
    newPage: 'ctrl+n',
    undo: 'ctrl+z',
    redo: 'ctrl+shift+z',
    remove: 'backspace',
    checkUncheck: 'esc',
    preExpendSelect: 'shift+up',
    nextExpendSelect: 'shift+down',
    mergeGroupUp: 'command+up',
    mergeGroupDown: 'command+down',
    mergeGroup: 'command+m',
    up: 'up',
    down: 'down',
    left: 'left',
    right: 'right',
    enter: 'enter',
};

type GlobalHotKeyTypes = 'search';
export type GlobalHotkeyMap = Record<GlobalHotKeyTypes, string>;

export const GlobalMacHotkeyMap: GlobalHotkeyMap = {
    search: 'alt+space',
};

export const GlobalWinHotkeyMap: GlobalHotkeyMap = {
    search: 'ctrl+space',
};
