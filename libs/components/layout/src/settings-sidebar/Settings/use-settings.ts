import { message } from '@toeverything/components/ui';
import { copyToClipboard } from '@toeverything/utils';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useSettingFlags, type SettingFlags } from './use-setting-flags';

import {
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
    key: string;
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
    const { t } = useTranslation();
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
            name: t('Duplicate Page'),
            key: 'Duplicate Page',
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
            name: t('Copy Page Link'),
            key: 'Copy Page Link',
            onClick: () => {
                copyToClipboard(window.location.href);
                message.success('Page link copied successfully');
            },
        },
        {
            type: 'button',
            name: t('Language'),
            key: 'Language',
            onClick: () => {
                // Do noting
            },
        },
        {
            type: 'separator',
            key: 'separator1',
        },
        {
            type: 'button',
            name: t('Export As Markdown'),
            key: 'Export As Markdown',
            onClick: async () => {
                const title = await getPageTitle({ workspaceId, pageId });
                exportMarkdown({ workspaceId, rootBlockId: pageId, title });
            },
            flag: 'booleanExportMarkdown',
        },
        {
            type: 'button',
            name: t('Export As HTML'),
            key: 'Export As HTML',
            onClick: async () => {
                const title = await getPageTitle({ workspaceId, pageId });
                exportHtml({ workspaceId, rootBlockId: pageId, title });
            },
            flag: 'booleanExportHtml',
        },
        {
            type: 'button',
            name: t('Export As PDF (Unsupported)'),
            key: 'Export As PDF (Unsupported)',
            onClick: () => console.log('Export As PDF'),
            flag: 'booleanExportPdf',
        },
        {
            type: 'separator',
            key: 'separator2',
        },
        {
            type: 'button',
            name: t('Clear Workspace'),
            key: 'Clear Workspace',
            onClick: () => clearWorkspace(workspaceId),
            flag: 'booleanClearWorkspace',
        },
        {
            type: 'button',
            name: t('Import Workspace'),
            key: 'Import Workspace',
            onClick: () => importWorkspace(workspaceId),
            flag: 'booleanClearWorkspace',
        },
        {
            type: 'button',
            name: t('Export Workspace'),
            key: 'Export Workspace',
            onClick: () => exportWorkspace(),
            flag: 'booleanExportWorkspace',
        },
    ];

    return filterSettings(settings, settingFlags);
};
