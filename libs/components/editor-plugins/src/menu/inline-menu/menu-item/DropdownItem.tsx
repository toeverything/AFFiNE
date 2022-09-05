import {
    fontBgColorPalette,
    fontColorPalette,
} from '@toeverything/components/common';
import { ArrowDropDownIcon } from '@toeverything/components/icons';
import {
    Popover,
    styled,
    Tooltip,
    type SvgIconProps,
} from '@toeverything/components/ui';
import { uaHelper } from '@toeverything/utils';
import { useCallback, useState } from 'react';
import style9 from 'style9';
import {
    inlineMenuNamesForFontColor,
    inlineMenuNamesKeys,
    MacInlineMenuShortcuts,
    WinInlineMenuShortcuts,
} from '../config';
import type { DropdownItemType, WithEditorSelectionType } from '../types';

type MenuDropdownItemProps = DropdownItemType & WithEditorSelectionType;

export const MenuDropdownItem = ({
    name,
    nameKey,
    icon: MenuIcon,
    children,
    editor,
    selectionInfo,
}: MenuDropdownItemProps) => {
    const [anchor_ele, set_anchor_ele] = useState<HTMLButtonElement | null>(
        null
    );

    const handle_close_dropdown_menu = useCallback(() => {
        set_anchor_ele(null);
    }, []);

    const shortcut = uaHelper.isMacOs
        ? //@ts-ignore
          MacInlineMenuShortcuts[nameKey]
        : //@ts-ignore
          WinInlineMenuShortcuts[nameKey];

    return (
        <Popover
            trigger="click"
            placement="bottom-start"
            content={
                <div className={styles('dropdownContainer')}>
                    {children.map(item => {
                        const {
                            name,
                            icon: ItemIcon,
                            onClick,
                            nameKey: itemNameKey,
                        } = item;

                        const StyledIcon = withStylesForIcon(ItemIcon);

                        return (
                            <button
                                className={styles('dropdownItem')}
                                key={name}
                                onClick={() => {
                                    if (
                                        onClick &&
                                        selectionInfo?.anchorNode?.id
                                    ) {
                                        onClick({
                                            editor,
                                            type: itemNameKey,
                                            anchorNodeId:
                                                selectionInfo?.anchorNode?.id,
                                        });
                                    }
                                    handle_close_dropdown_menu();
                                }}
                            >
                                <StyledIcon
                                    fontColor={
                                        nameKey ===
                                        inlineMenuNamesKeys.currentFontColor
                                            ? fontColorPalette[
                                                  inlineMenuNamesForFontColor[
                                                      itemNameKey as keyof typeof inlineMenuNamesForFontColor
                                                  ]
                                              ]
                                            : nameKey ===
                                              inlineMenuNamesKeys.currentFontBackground
                                            ? fontBgColorPalette[
                                                  inlineMenuNamesForFontColor[
                                                      itemNameKey as keyof typeof inlineMenuNamesForFontColor
                                                  ]
                                              ]
                                            : ''
                                    }
                                    // fontBgColor={
                                    //     nameKey=== inlineMenuNamesKeys.currentFontBackground ?  fontBgColorPalette[
                                    //         inlineMenuNamesForFontColor[itemNameKey] as keyof typeof fontBgColorPalette
                                    //     ]:''
                                    // }
                                />
                                {/* <ItemIcon sx={{ width: 20, height: 20 }} /> */}
                                <span className={styles('dropdownItemItext')}>
                                    {name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            }
        >
            <Tooltip
                content={
                    <div style={{ padding: '2px 4px' }}>
                        <p>{name}</p>
                        {shortcut && <p>{shortcut}</p>}
                    </div>
                }
                placement="top"
                trigger="hover"
            >
                <button
                    className={styles('currentDropdownButton')}
                    aria-label={name}
                >
                    <MenuIcon sx={{ width: 20, height: 20 }} />
                    <ArrowDropDownIcon sx={{ width: 20, height: 20 }} />
                </button>
            </Tooltip>
        </Popover>
    );
};

const withStylesForIcon = (
    FontIconComponent: (prop: SvgIconProps) => JSX.Element
) =>
    styled(FontIconComponent, {
        shouldForwardProp: (prop: string) =>
            !['fontColor', 'fontBgColor'].includes(prop),
    })<{ fontColor?: string; fontBgColor?: string }>(
        ({ fontColor, fontBgColor }) => {
            return {
                width: 20,
                height: 20,
                color: fontColor || undefined,
                backgroundColor: fontBgColor || undefined,
            };
        }
    );

const styles = style9.create({
    currentDropdownButton: {
        display: 'inline-flex',
        padding: '0',
        margin: '15px 6px',
        color: '#98acbd',
        ':hover': { backgroundColor: 'transparent' },
    },
    dropdownContainer: {
        margin: '8px 4px',
    },
    dropdownItem: {
        display: 'flex',
        alignItems: 'center',
        // @ts-ignore
        gap: '12px',
        // width: '120px',
        height: '32px',
        padding: '0px 12px',
        borderRadius: '5px',
        color: '#98acbd',
        ':hover': { backgroundColor: '#F5F7F8' },
    },
    dropdownItemItext: {
        color: '#4C6275',
        fontFamily: 'Helvetica,Arial,"Microsoft Yahei",SimHei,sans-serif',
    },
});
