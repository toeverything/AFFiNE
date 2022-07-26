import { CommingSoon } from '@toeverything/components/common';
import {
    mergeToPreviousGroup,
    RecastScene,
    RecastView,
    useCurrentView,
    useRecastView,
} from '@toeverything/components/editor-core';
import {
    AddViewIcon,
    FilterIcon,
    FullScreenIcon,
    GroupByIcon,
    GroupIcon,
    KanBanIcon,
    SortIcon,
    TableIcon,
    TodoListIcon,
} from '@toeverything/components/icons';
import { Popover, useTheme } from '@toeverything/components/ui';
import { useFlag } from '@toeverything/datasource/feature-flags';
import type { AsyncBlock, BlockEditor } from '@toeverything/framework/virgo';
import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';
import { Filter } from './components/filter';
import { GroupBy } from './components/group-by/GroupBy';
import { GroupPanel } from './components/group-panel/GroupPanel';
import { IconButton } from './components/IconButton';
import { Line } from './components/Line';
import { Sorter } from './components/sorter';
import { PANEL_CONFIG } from './config';
import type { ActivePanel } from './types';

const VIEW_ICON_MAP: Record<RecastView['type'], ReactElement> = {
    page: <TodoListIcon fontSize="small" />,
    kanban: <KanBanIcon fontSize="small" />,
    table: <TableIcon fontSize="small" />,
};

const ViewsMenu = () => {
    const { currentView, recastViews, setCurrentView } = useRecastView();
    return (
        <>
            {recastViews.map(view => (
                <IconButton
                    key={view.id}
                    active={view.id === currentView.id}
                    onClick={() => setCurrentView(view)}
                >
                    {VIEW_ICON_MAP[view.type]}
                    {view.name}
                </IconButton>
            ))}
        </>
    );
};

const GroupMenuWrapper = ({
    block,
    editor,
    children,
}: {
    block: AsyncBlock;
    editor: BlockEditor;
    children: ReactNode;
}) => {
    /* feature flag: sprint14 close Filter、Sort feature */
    const filterSorterFlag = useFlag('FilterSorter', false);
    const [currentView] = useCurrentView();
    const theme = useTheme();

    /* state: add active-style */
    const [activePanel, setActivePanel] = useState<ActivePanel | null>(
        PANEL_CONFIG.GROUP_BY
    );
    /* state: open panel */
    const [openPanel, setOpenPanel] = useState<ActivePanel | null>(null);

    /**
     * close panel state/active state
     */
    const closePanel = () => {
        setActivePanel(null);
        setOpenPanel(null);
    };

    /**
     * change open panel: if target is current, close panel; else change
     * update active panel
     * @param panel
     */
    const onPanelChange = (panel: ActivePanel) => {
        if (openPanel === panel) {
            return closePanel();
        }

        setActivePanel(panel);
        setOpenPanel(panel);
    };

    return (
        <Popover
            placement="top-end"
            zIndex={theme.affine.zIndex.header - 1}
            content={
                <GroupPanel>
                    <ViewsMenu />

                    {filterSorterFlag && (
                        <IconButton
                            active={activePanel === PANEL_CONFIG.ADD_VIEW}
                            onClick={() =>
                                setActivePanel(
                                    PANEL_CONFIG.ADD_VIEW as ActivePanel
                                )
                            }
                        >
                            <AddViewIcon fontSize="small" />
                            Add View
                        </IconButton>
                    )}

                    {
                        // // Closed beta period temporarily
                        // filterSorterFlag && (
                        //     <IconButton
                        //         active={scene === SCENE_CONFIG.TABLE}
                        //         onClick={setTable}
                        //     >
                        //         <TableIcon fontSize="small" />
                        //         Table View
                        //     </IconButton>
                        // )
                        <CommingSoon>
                            <IconButton style={{ cursor: 'not-allowed' }}>
                                <TableIcon fontSize="small" />
                                Table
                            </IconButton>
                        </CommingSoon>
                    }
                    <CommingSoon>
                        <IconButton style={{ cursor: 'not-allowed' }}>
                            <KanBanIcon fontSize="small" />
                            Calendar
                        </IconButton>
                    </CommingSoon>
                    <CommingSoon>
                        <IconButton style={{ cursor: 'not-allowed' }}>
                            <TableIcon fontSize="small" />
                            Timeline
                        </IconButton>
                    </CommingSoon>
                    <CommingSoon>
                        <IconButton style={{ cursor: 'not-allowed' }}>
                            <KanBanIcon fontSize="small" />
                            BI
                        </IconButton>
                    </CommingSoon>

                    {
                        // Closed beta period temporarily
                        filterSorterFlag && (
                            <IconButton
                                active={activePanel === PANEL_CONFIG.FILTER}
                                extraStyle={{ position: 'relative' }}
                                onClick={() =>
                                    onPanelChange(PANEL_CONFIG.FILTER)
                                }
                            >
                                <FilterIcon fontSize="small" />
                                Filter
                                {openPanel === PANEL_CONFIG.FILTER && (
                                    <Filter
                                        block={block}
                                        closePanel={closePanel}
                                    />
                                )}
                            </IconButton>
                        )
                    }

                    {
                        // Closed beta period temporarily
                        filterSorterFlag &&
                            currentView.type === RecastScene.Kanban && (
                                <IconButton
                                    active={activePanel === PANEL_CONFIG.SORTER}
                                    onClick={() =>
                                        onPanelChange(PANEL_CONFIG.SORTER)
                                    }
                                >
                                    <SortIcon fontSize="small" />
                                    Sort
                                    {openPanel === PANEL_CONFIG.SORTER && (
                                        <Sorter
                                            block={block}
                                            closePanel={closePanel}
                                        />
                                    )}
                                </IconButton>
                            )
                    }

                    {currentView.type === RecastScene.Kanban && (
                        <IconButton
                            active={true}
                            onClick={() => onPanelChange(PANEL_CONFIG.GROUP_BY)}
                        >
                            <GroupByIcon fontSize="small" />
                            GroupBy
                            {openPanel === PANEL_CONFIG.GROUP_BY && (
                                <GroupBy closePanel={closePanel} />
                            )}
                        </IconButton>
                    )}

                    {filterSorterFlag && <Line />}

                    {
                        // Closed beta period temporarily
                        filterSorterFlag && (
                            <IconButton extraStyle={{ width: 32 }}>
                                <FullScreenIcon fontSize="small" />
                            </IconButton>
                        )
                    }

                    {
                        // Closed beta period temporarily
                        filterSorterFlag && (
                            <IconButton
                                extraStyle={{ width: 32 }}
                                onClick={async () => {
                                    await mergeToPreviousGroup(block);
                                }}
                            >
                                <GroupIcon fontSize="small" />
                            </IconButton>
                        )
                    }
                </GroupPanel>
            }
        >
            {children}
        </Popover>
    );
};

export { GroupMenuWrapper };
