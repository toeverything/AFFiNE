import { useState } from 'react';
import type { ReactNode } from 'react';
import {
    mergeToPreviousGroup,
    RecastScene,
    useRecastBlockScene,
    useRecastKanbanGroupBy,
} from '@toeverything/components/editor-core';
import { Popover, useTheme, Tooltip } from '@toeverything/components/ui';
import type { AsyncBlock, BlockEditor } from '@toeverything/framework/virgo';
import { Filter } from './components/filter';
import { Sorter } from './components/sorter';
import { GroupPanel } from './components/group-panel/GroupPanel';
import { IconButton } from './components/IconButton';
import { Line } from './components/Line';
import {
    TodoListIcon,
    KanBanIcon,
    TableIcon,
    FilterIcon,
    SortIcon,
    FullScreenIcon,
    GroupIcon,
    GroupByIcon,
} from '@toeverything/components/icons';
import { PANEL_CONFIG, SCENE_CONFIG } from './config';

import type { ActivePanel } from './types';
import { useFlag } from '@toeverything/datasource/feature-flags';
import { GroupBy } from './components/group-by/GroupBy';

import { CommingSoon } from '@toeverything/components/common';
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
    const { scene, setPage, setKanban, setTable } = useRecastBlockScene();
    const { groupBy } = useRecastKanbanGroupBy();
    const theme = useTheme();

    /* state: add active-style */
    const [activePanel, setActivePanel] = useState<ActivePanel>(
        PANEL_CONFIG.GROUP_BY
    );
    /* state: open panel */
    const [openPanel, setOpenPanel] = useState<ActivePanel>(null);

    /**
     * close panel state/active state
     */
    const closePanel = () => {
        if (!groupBy?.id) {
            setActivePanel(null);
        }

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
                    <IconButton
                        active={scene === SCENE_CONFIG.PAGE}
                        onClick={setPage}
                    >
                        <TodoListIcon fontSize="small" />
                        <span>Text View</span>
                    </IconButton>
                    <IconButton
                        active={scene === SCENE_CONFIG.KANBAN}
                        onClick={setKanban}
                    >
                        <KanBanIcon fontSize="small" />
                        Kanban
                    </IconButton>
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
                            <IconButton
                                active={scene === SCENE_CONFIG.TABLE}
                                style={{ cursor: 'not-allowed' }}
                            >
                                <TableIcon fontSize="small" />
                                Table
                            </IconButton>
                        </CommingSoon>
                    }
                    <CommingSoon>
                        <IconButton
                            active={scene === SCENE_CONFIG.TABLE}
                            style={{ cursor: 'not-allowed' }}
                        >
                            <KanBanIcon fontSize="small" />
                            Calendar
                        </IconButton>
                    </CommingSoon>
                    <CommingSoon>
                        <IconButton
                            active={scene === SCENE_CONFIG.TABLE}
                            style={{ cursor: 'not-allowed' }}
                        >
                            <TableIcon fontSize="small" />
                            Timeline
                        </IconButton>
                    </CommingSoon>
                    <CommingSoon>
                        <IconButton
                            active={scene === SCENE_CONFIG.TABLE}
                            style={{ cursor: 'not-allowed' }}
                        >
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

                    {scene === RecastScene.Kanban && (
                        <IconButton
                            active={activePanel === PANEL_CONFIG.GROUP_BY}
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
