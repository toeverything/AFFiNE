import React, { useState } from 'react';
import { Virgo, PluginHooks } from '@toeverything/framework/virgo';
import { Cascader, CascaderItemProps } from '@toeverything/components/ui';
import { TurnIntoMenu } from './TurnIntoMenu';
import {
    DeleteCashBinIcon,
    TurnIntoIcon,
    UngroupIcon,
} from '@toeverything/components/icons';

interface LeftMenuProps {
    anchorEl?: Element;
    children?: React.ReactElement;
    onClose: () => void;
    editor?: Virgo;
    hooks: PluginHooks;
    blockId: string;
}

export function LeftMenu(props: LeftMenuProps) {
    const { editor, anchorEl, hooks, blockId } = props;
    const menu: CascaderItemProps[] = [
        {
            title: 'Delete',
            callback: () => {
                editor.commands.blockCommands.removeBlock(blockId);
            },
            shortcut: 'Del',
            icon: <DeleteCashBinIcon />,
        },
        {
            title: 'Turn into',
            subItems: [],
            children: (
                <TurnIntoMenu
                    editor={editor}
                    hooks={hooks}
                    blockId={blockId}
                    onClose={() => {
                        props.onClose();
                        editor.selection.setSelectedNodesIds([]);
                    }}
                />
            ),
            icon: <TurnIntoIcon />,
        },
        {
            title: 'Divide Here As A New Group',
            icon: <UngroupIcon />,
            callback: () => {
                editor.commands.blockCommands.splitGroupFromBlock(blockId);
            },
        },
    ].filter(v => v);

    const [menuList, setMenuList] = useState<CascaderItemProps[]>(menu);

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
                items={menuList}
                anchorEl={anchorEl}
                placement="bottom-start"
                open={Boolean(anchorEl)}
                onClose={() => props.onClose()}
            />
        </>
    );
}
