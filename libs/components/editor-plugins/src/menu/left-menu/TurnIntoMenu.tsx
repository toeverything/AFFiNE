import React from 'react';
import { BlockFlavorKeys, Protocol } from '@toeverything/datasource/db-service';
import { Virgo, PluginHooks } from '@toeverything/framework/virgo';
import { CommandMenuContainer } from '../command-menu/Container';
import { defaultCategoriesList, defaultTypeList } from '../command-menu/config';
interface TurnIntoMenuProps {
    editor: Virgo;
    hooks: PluginHooks;
    blockId: string;
    onClose?: () => void;
}

export const TurnIntoMenu = ({
    blockId,
    editor,
    hooks,
    onClose,
}: TurnIntoMenuProps) => {
    const handle_select = (type: string) => {
        if (Protocol.Block.Type[type as BlockFlavorKeys]) {
            editor.commands.blockCommands.convertBlock(
                blockId,
                type as BlockFlavorKeys
            );
            onClose && onClose();
        }
    };
    return (
        <CommandMenuContainer
            editor={editor}
            hooks={hooks}
            isShow={true}
            blockId={blockId}
            onSelected={handle_select}
            types={defaultTypeList}
            categories={defaultCategoriesList}
            style={{ position: 'relative', boxShadow: 'none', padding: '0' }}
        />
    );
};
