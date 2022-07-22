import {
    useShowSettingsSidebar,
    useShowSpaceSidebar,
} from '@toeverything/datasource/state';

/**
 * TODO: This is not Reading Mode, it needs to be discussed later, so I will write it now
 */
export const useReadingMode = () => {
    const { setShowSettingsSidebar } = useShowSettingsSidebar();
    const { fixedDisplay, toggleSpaceSidebar } = useShowSpaceSidebar();
    const readingMode = !fixedDisplay;

    const toggleReadingMode = () => {
        toggleSpaceSidebar();
        setShowSettingsSidebar(readingMode);
    };

    return {
        readingMode,
        toggleReadingMode,
    };
};
