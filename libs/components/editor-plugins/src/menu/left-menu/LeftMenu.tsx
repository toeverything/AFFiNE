import {
    AddViewIcon,
    DeleteCashBinIcon,
    TurnIntoIcon,
    UngroupIcon,
} from '@toeverything/components/icons';
import { Cascader, CascaderItemProps } from '@toeverything/components/ui';
import { Protocol } from '@toeverything/datasource/db-service';
import { useTranslation } from '@toeverything/datasource/i18n';
import { PluginHooks, Virgo } from '@toeverything/framework/virgo';
import { useMemo } from 'react';
import { TurnIntoMenu } from './TurnIntoMenu';

interface LeftMenuProps {
    anchorEl?: Element;
    children?: React.ReactElement;
    onClose: () => void;
    editor?: Virgo;
    hooks: PluginHooks;
    blockId: string;
    onDelete: () => void;
}

export function LeftMenu(props: LeftMenuProps) {
    const { editor, anchorEl, hooks, blockId, onClose, onDelete } = props;
    const { t } = useTranslation();
    const menu: CascaderItemProps[] = useMemo(
        () => [
            {
                title: t('Delete'),
                callback: async () => {
                    await editor.commands.blockCommands.removeBlock(
                        blockId,
                        onDelete
                    );
                },
                shortcut: 'Del',
                icon: <DeleteCashBinIcon />,
            },
            {
                title: t('Turn into'),
                subItems: [],
                children: (
                    <TurnIntoMenu
                        editor={editor}
                        hooks={hooks}
                        blockId={blockId}
                        onClose={() => {
                            onClose();
                            editor.selection.setSelectedNodesIds([]);
                        }}
                    />
                ),
                icon: <TurnIntoIcon />,
            },
            {
                title: t('Add A Below Block'),
                icon: <AddViewIcon />,
                callback: async () => {
                    const block = await editor.getBlockById(blockId);
                    const belowType = [
                        Protocol.Block.Type.numbered,
                        Protocol.Block.Type.bullet,
                        Protocol.Block.Type.todo,
                    ].some(type => type === block.type)
                        ? block.type
                        : Protocol.Block.Type.text;
                    editor.commands.blockCommands.createNextBlock(
                        blockId,
                        belowType
                    );
                },
            },
            {
                title: t('Divide Here As A New Group'),
                icon: <UngroupIcon />,
                callback: () => {
                    editor.commands.blockCommands.splitGroupFromBlock(blockId);
                },
            },
        ],
        [t, editor, hooks, blockId, onClose]
    );

    // const filterItems = (
    //     value: string,
    //     menuList: CascaderItemProps[],
    //     filterList: CascaderItemProps[]
    // ) => {
    //     menuList.forEach(item => {
    //         if (item?.subItems.length === 0) {
    //             if (item.title.toLocaleLowerCase().indexOf(value) !== -1) {
    //                 filterList.push(item);
    //             }
    //         } else {
    //             filterItems(value, item.subItems || [], filterList);
    //         }
    //     });
    // };

    // const on_filter = (
    //     e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>
    // ) => {
    //     const value = e.currentTarget.value;
    //     if (!value) {
    //         setMenuList(menu);
    //     } else {
    //         const filterList: CascaderItemProps[] = [];
    //         filter_items(value.toLocaleLowerCase(), menu, filterList);
    //         setMenuList(
    //             filterList.length > 0 ? filterList : [{ title: 'No Result' }]
    //         );
    //     }
    // };

    return (
        <>
            {props.children}
            <Cascader
                items={menu}
                anchorEl={anchorEl}
                placement="bottom-start"
                open={Boolean(anchorEl)}
                onClose={() => props.onClose()}
            />
        </>
    );
}
