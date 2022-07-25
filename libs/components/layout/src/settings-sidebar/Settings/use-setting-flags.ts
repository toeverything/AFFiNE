import { useFlag } from '@toeverything/datasource/feature-flags';

export const useSettingFlags = () => {
    const booleanFullWidthChecked = useFlag('BooleanFullWidthChecked', false);
    const booleanExportWorkspace = useFlag('BooleanExportWorkspace', false);
    const booleanImportWorkspace = useFlag('BooleanImportWorkspace', false);
    const booleanExportHtml = useFlag('BooleanExportHtml', false);
    const booleanExportPdf = useFlag('BooleanExportPdf', false);
    const booleanExportMarkdown = useFlag('BooleanExportMarkdown', false);
    const booleanClearWorkspace = useFlag('BooleanClearWorkspace', true);

    return {
        booleanFullWidthChecked,
        booleanExportWorkspace,
        booleanImportWorkspace,
        booleanExportHtml,
        booleanExportPdf,
        booleanExportMarkdown,
        booleanClearWorkspace,
    };
};

export type SettingFlags = ReturnType<typeof useSettingFlags>;
