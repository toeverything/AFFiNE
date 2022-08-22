import { ComponentType, ReactElement } from 'react';

import type {
    Column,
    DefaultColumnsValue,
} from '@toeverything/datasource/db-service';
import {
    ArrayOperation,
    BlockDecoration,
    MapOperation,
} from '@toeverything/datasource/jwt';
import { cloneDeep } from '@toeverything/utils';
import type { EventData } from '../block';
import { AsyncBlock } from '../block';
import type { Editor } from '../editor';
import { SelectBlock } from '../selection';

export interface CreateView {
    block: AsyncBlock;
    editor: Editor;
    editorElement: () => JSX.Element;
    /**
     * @deprecated Use recast table instead
     */
    columns: Column[];
    /**
     * @deprecated Use recast table instead
     */
    columnsFromId: string;
}

export interface ChildrenView extends CreateView {
    children: ReactElement;
}

export abstract class BaseView {
    abstract type: string;

    /**
     * activatable means can be focused
     * @memberof BaseView
     */
    public activatable = true;

    public selectable = true;

    /**
     *
     * layout only means the block is only used as structured block
     * @memberof BaseView
     */
    public layoutOnly = false;

    /**
     * Whether to display the widget below the block
     * @deprecated pending further evaluation, use with caution
     */
    public allowPendant = true;

    abstract View: ComponentType<CreateView>;

    ChildrenView: ComponentType<ChildrenView>;

    /** Life Cycle */

    // If it returns null, it means the creation failed
    async onCreate(block: AsyncBlock): Promise<AsyncBlock | null> {
        return block;
    }

    // when the data is updated, call
    async onUpdate(event: EventData): Promise<void> {
        return;
    }

    /**
     * Called when a child node is deleted
     */
    async onDeleteChild(block: AsyncBlock): Promise<boolean> {
        return true;
    }

    onExport(content: MapOperation<any>): string {
        try {
            return JSON.stringify((content as any)['toJSON']());
            // eslint-disable-next-line no-empty
        } catch (e) {
            return '';
        }
    }

    onMetadata(
        content: MapOperation<any>
    ): Array<[string, number | string | string[]]> {
        return [];
    }

    onTagging(content: MapOperation<any>): string[] {
        return [];
    }

    protected get_decoration<T>(
        content: MapOperation<ArrayOperation<any>>,
        name: string
    ): T | undefined {
        return content
            .get('decoration')
            ?.asArray<BlockDecoration>()
            ?.find<BlockDecoration>(obj => obj.key === name)?.value as T;
    }

    /** Component utility function */

    // Whether the component is empty
    isEmpty(block: AsyncBlock): boolean {
        const text = block.getProperty('text');
        const result = !text?.value?.[0]?.text;

        // Assert that the text is really empty
        if (
            result &&
            block.getProperty('text')?.value.some(content => content.text)
        ) {
            console.warn(
                'Assertion isEmpty error! The block has an empty start fragment, but it is not empty',
                block
            );
        }
        // Assert end

        return result;
    }

    html2block(el: Element, parseEl: (el: Element) => any[]): any[] | null {
        return null;
    }

    async block2Text(
        block: AsyncBlock,
        // The selectInfo parameter is not passed when the block is selected in ful, the selectInfo.type is Range
        selectInfo?: SelectBlock
    ): Promise<string> {
        return '';
    }

    // TODO: Try using new methods
    async block2html(props: {
        editor: Editor;
        block: AsyncBlock;
        // The selectInfo parameter is not passed when the block is selected in ful, the selectInfo.type is Range
        selectInfo?: SelectBlock;
    }) {
        return '';
    }
}
