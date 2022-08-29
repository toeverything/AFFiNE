import { message } from '@toeverything/components/ui';
import { copyToClipboard } from '@toeverything/utils';
import { useNavigate } from 'react-router-dom';
import { useSettingFlags, type SettingFlags } from './use-setting-flags';
import {
    // useReadingMode,
    clearWorkspace,
    duplicatePage,
    exportHtml,
    exportMarkdown,
    exportWorkspace,
    getPageTitle,
    importWorkspace,
    useWorkspaceAndPageId,
} from './util';

interface BaseSettingItem {
    flag?: keyof SettingFlags;
}

interface SwitchItem extends BaseSettingItem {
    name: string;
    type: 'switch';
    value: boolean;
    onChange: (value: boolean) => void;
}

interface SeparatorItem extends BaseSettingItem {
    type: 'separator';
}

interface ButtonItem extends BaseSettingItem {
    name: string;
    type: 'button';
    onClick: () => void;
}

type SettingItem = SwitchItem | SeparatorItem | ButtonItem;

const filterSettings = (settings: SettingItem[], flags: SettingFlags) => {
    return settings
        .filter(setting => {
            if (!setting.flag) {
                return true;
            }
            return flags[setting.flag];
        })
        .filter((setting, index, array) => {
            if (setting.type === 'separator') {
                if (
                    // If the current is a separator, and the following is also a separator, delete the current one
                    array[index + 1]?.type === 'separator' ||
                    // If the current separator is the last one, delete the current one
                    index === array.length - 1
                ) {
                    return false;
                }
            }
            return true;
        });
};

export const useSettings = (): SettingItem[] => {
    const { workspaceId, pageId } = useWorkspaceAndPageId();
    const navigate = useNavigate();
    const settingFlags = useSettingFlags();
    // const { toggleReadingMode, readingMode } = useReadingMode();

    const settings: SettingItem[] = [
        // {
        //     type: 'switch',
        //     name: 'Reading Mode',
        //     value: readingMode,
        //     onChange: () => {
        //         toggleReadingMode();
        //     },
        // },
        // {
        //     type: 'separator',
        // },
        {
            type: 'button',
            name: 'Duplicate Page',
            onClick: async () => {
                const newPageInfo = await duplicatePage({
                    workspaceId,
                    pageId,
                });
                navigate(`/${newPageInfo.workspaceId}/${newPageInfo.pageId}`);
            },
        },
        {
            type: 'button',
            name: 'Copy Page Link',
            onClick: () => {
                copyToClipboard(window.location.href);
                message.success('Page link copied successfully');
            },
        },
        {
            type: 'button',
            name: 'Language',
            onClick: () => {
                console.log('Language is change');
            },
        },
        {
            type: 'separator',
        },
        {
            type: 'button',
            name: 'Export As Markdown',
            onClick: async () => {
                const title = await getPageTitle({ workspaceId, pageId });
                exportMarkdown({ workspaceId, rootBlockId: pageId, title });
            },
            flag: 'booleanExportMarkdown',
        },
        {
            type: 'button',
            name: 'Export As HTML',
            onClick: async () => {
                const title = await getPageTitle({ workspaceId, pageId });
                exportHtml({ workspaceId, rootBlockId: pageId, title });
            },
            flag: 'booleanExportHtml',
        },
        {
            type: 'button',
            name: 'Export As PDF (Unsupported)',
            onClick: () => console.log('Export As PDF'),
            flag: 'booleanExportPdf',
        },
        {
            type: 'separator',
        },
        {
            type: 'button',
            name: 'Import Workspace',
            onClick: () => importWorkspace(workspaceId),
            flag: 'booleanImportWorkspace',
        },
        {
            type: 'button',
            name: 'Export Workspace',
            onClick: () => exportWorkspace(),
            flag: 'booleanExportWorkspace',
        },
        {
            type: 'button',
            name: 'Clear Workspace',
            onClick: () => clearWorkspace(workspaceId),
            flag: 'booleanClearWorkspace',
        },
    ];

    return filterSettings(settings, settingFlags);
};
