import { useState } from 'react';
import { TextareaGroup } from './TextareaGroup';
import { Panel } from '../Panel';
import { Title } from '../Title';
import { HelpCenterIcon } from '@toeverything/components/icons';
import { MODE_CONFIG } from './config/filter-mode-config';
import { FilterGroup } from './FilterGroup';
import { FilterContext } from './context/filter-context';
import type { ClosePanel } from '../../types';
import type { PanelMode } from './types';
import type { AsyncBlock } from '@toeverything/framework/virgo';

export const Filter = ({
    closePanel,
    block,
}: {
    closePanel: ClosePanel;
    block: AsyncBlock;
}) => {
    const [mode, setMode] = useState<PanelMode>(MODE_CONFIG.NORMAL);

    /**
     * switch mode：weak-sql or filter-group
     */
    const switchMode = () => {
        setMode(
            mode === MODE_CONFIG.NORMAL
                ? MODE_CONFIG.WEAK_SQL
                : MODE_CONFIG.NORMAL
        );
    };

    /* remain：probably won't use */
    const makeView = () => {
        /* create a view */
        closePanel();
    };

    const context = {
        mode,
        switchMode,
        makeView,
        block,
    };

    return (
        <FilterContext.Provider value={context}>
            <Panel>
                <Title>
                    <div>Filter</div>
                    <HelpCenterIcon fontSize="small" />
                </Title>
                {mode === MODE_CONFIG.NORMAL ? (
                    <FilterGroup />
                ) : (
                    <TextareaGroup />
                )}
            </Panel>
        </FilterContext.Provider>
    );
};
