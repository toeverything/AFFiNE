import {
    RecastScene,
    useRecastView,
} from '@toeverything/components/editor-core';
import { AddViewIcon, DoneIcon } from '@toeverything/components/icons';
import { Input, MuiClickAwayListener } from '@toeverything/components/ui';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useState } from 'react';
import { IconButton } from '../components/IconButton';
import { Panel } from '../components/Panel';
import { VIEW_ICON_MAP } from './constant';
import { PanelItem } from './styles';

export const AddViewMenu = () => {
    const [viewName, setViewName] = useState('');
    const [viewType, setViewType] = useState<RecastScene>(RecastScene.Page);
    const [activePanel, setActivePanel] = useState(false);
    const { addView, setCurrentView } = useRecastView();

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setViewName(e.target.value.trim());
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') {
            return;
        }
        handleAddView();
    };

    const handleAddView = async () => {
        const newView = await addView({ name: viewName, type: viewType });
        await setCurrentView(newView);
        setActivePanel(false);
    };

    return (
        <MuiClickAwayListener onClickAway={() => setActivePanel(false)}>
            <IconButton
                active={activePanel}
                onClick={() => setActivePanel(!activePanel)}
            >
                <AddViewIcon fontSize="small" />
                <span>Add View</span>
                {activePanel && (
                    <Panel>
                        <PanelItem>
                            <Input
                                placeholder="View Name"
                                autoFocus
                                style={{ flex: 1 }}
                                onChange={handleChange}
                                onKeyDown={handleKeyDown}
                            />
                            <IconButton
                                aria-label="done"
                                onClick={handleAddView}
                            >
                                <DoneIcon />
                            </IconButton>
                        </PanelItem>

                        <PanelItem>
                            {Object.entries(VIEW_ICON_MAP).map(
                                ([name, icon]) => (
                                    <IconButton
                                        key={name}
                                        active={
                                            viewType === (name as RecastScene)
                                        }
                                        onClick={() => {
                                            if (name === 'table') {
                                                // The table view is under progress
                                                return;
                                            }
                                            setViewType(name as RecastScene);
                                        }}
                                    >
                                        {VIEW_ICON_MAP[name as RecastScene]}
                                        {name.toUpperCase()}
                                    </IconButton>
                                )
                            )}
                        </PanelItem>
                    </Panel>
                )}
            </IconButton>
        </MuiClickAwayListener>
    );
};
