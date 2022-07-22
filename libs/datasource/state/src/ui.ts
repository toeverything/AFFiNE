import { useCallback } from 'react';
import { atom, useAtom } from 'jotai';

const _showSpaceSidebarAtom = atom<boolean>(true);
const _fixedDisplayAtom = atom<boolean>(true);

/** workspace panel status including page-tree, default open */
export const useShowSpaceSidebar = () => {
    const [showSpaceSidebar, setShowSpaceSidebar] = useAtom(
        _showSpaceSidebarAtom
    );

    const [fixedDisplay, setAlltime] = useAtom(_fixedDisplayAtom);

    const toggleSpaceSidebar = useCallback(() => {
        setAlltime(prev => !prev);
        setShowSpaceSidebar(false);
    }, [setAlltime, setShowSpaceSidebar]);

    const setSpaceSidebarVisible = useCallback(
        (visible: boolean) => setShowSpaceSidebar(visible),
        [setShowSpaceSidebar]
    );

    return {
        showSpaceSidebar,
        fixedDisplay,
        toggleSpaceSidebar,
        setSpaceSidebarVisible,
    };
};

const _showSettingsSidebarAtom = atom<boolean>(false);

/** settings/layout/comment side panel status, default closed  */
export const useShowSettingsSidebar = () => {
    const [showSettingsSidebar, setShowSettingsSidebar] = useAtom(
        _showSettingsSidebarAtom
    );

    const toggleSettingsSidebar = useCallback(
        () => setShowSettingsSidebar(prev => !prev),
        [setShowSettingsSidebar]
    );

    return {
        showSettingsSidebar,
        setShowSettingsSidebar,
        toggleSettingsSidebar,
    };
};
