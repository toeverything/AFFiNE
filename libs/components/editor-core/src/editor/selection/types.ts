import { Point } from '@toeverything/utils';
import { Range } from 'slate';
import { AsyncBlock } from '../block';

export const changeEventName = 'selection-change';
export const selectEndEventName = 'select-end';
export interface TextSelection {
    anchor: { offset: number; path: Array<number> };
    focus: { offset: number; path: Array<number> };
}

export type ModelType = 'None' | 'Range' | 'Caret' | 'Block';

/** -*-*-*- enum import start -*-*-*- **/

export enum SelectEventTypes {
    active = 'active',
    setSelection = 'setSelection',
    onSelect = 'onSelect',
}

export interface SelectEventCallbackTypes {
    [SelectEventTypes.active]: [CursorTypes];
    [SelectEventTypes.onSelect]: [boolean];
    [SelectEventTypes.setSelection]: [
        SelectionSettingsMap[keyof SelectionSettingsMap]
    ];
}

/** -*-*-*- enum import end -*-*-*- **/

/** -*-*-*- interface import start -*-*-*- **/

/**
 *
 * types for set selection
 * @export
 * @interface SelectionSettingsMap
 */
export interface SelectionSettingsMap {
    Range: Range | Point;
    None: null;
    Caret: Range | Point;
    Block: null;
}

/** -*-*-*- interface import end -*-*-*- **/

/** -*-*-*- type import start -*-*-*- **/

export type IdList = Array<string>;

export type SelectionTypes = 'None' | 'Range' | 'Caret' | 'Block';

export type SelectionSettings = SelectionSettingsMap[SelectionTypes];

export type AsyncBlockList = Array<AsyncBlock>;

export type Path = Array<string>;

export type PathList = Array<Path>;

export type CursorTypes = Point | 'start' | 'end';

export type Form = 'up' | 'down';

export interface SelectPosition {
    arrayIndex: number;
    offset: number;
}

export interface SelectBlock {
    blockId: string;
    startInfo?: SelectPosition;
    endInfo?: SelectPosition;
    children: SelectBlock[];
}

export interface SelectInfo {
    type: 'Block' | 'Range' | 'None';
    blocks: SelectBlock[];
}
/** -*-*-*- type import end -*-*-*- **/
