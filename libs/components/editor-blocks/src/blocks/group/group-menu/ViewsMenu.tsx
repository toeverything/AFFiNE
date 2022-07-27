import {
    RecastScene,
    RecastView,
    useRecastView,
} from '@toeverything/components/editor-core';
import { DeleteCashBinIcon, DoneIcon } from '@toeverything/components/icons';
import { Input } from '@toeverything/components/ui';
import type { ChangeEvent, KeyboardEvent } from 'react';
import { useState } from 'react';
import { IconButton } from '../components/IconButton';
import { Panel } from '../components/Panel';
import { VIEW_ICON_MAP } from './constant';
import { PanelItem } from './styles';

export const ViewsMenu = () => {
    const [viewName, setViewName] = useState('');
    const [viewType, setViewType] = useState<RecastScene>(RecastScene.Page);
    const [activeView, setActiveView] = useState<RecastView | null>(null);
    const { currentView, recastViews, setCurrentView, updateView, removeView } =
        useRecastView();

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setViewName(e.target.value.trim());
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') {
            return;
        }
        handleUpdateView();
    };

    const handleUpdateView = async () => {
        if (!activeView) {
            return;
        }
        await updateView({
            ...activeView,
            name: viewName,
            type: viewType,
        });
        setActiveView(null);
    };

    const handleDelete = async () => {
        if (!activeView) {
            return;
        }
        await removeView(activeView.id);

        setActiveView(null);
    };

    return (
        <>
            {recastViews.map(view => (
                <IconButton
                    key={view.id}
                    active={view.id === currentView.id}
                    onClick={() => setCurrentView(view)}
                    onContextMenu={e => {
                        setViewName(view.name);
                        setViewType(view.type);
                        setActiveView(view);
                        e.preventDefault();
                    }}
                >
                    {VIEW_ICON_MAP[view.type]}
                    <span style={{ userSelect: 'none' }}>{view.name}</span>

                    {activeView === view && (
                        <Panel>
                            <PanelItem>
                                <Input
                                    placeholder="View Name"
                                    autoFocus
                                    style={{ flex: 1 }}
                                    value={viewName}
                                    onChange={handleChange}
                                    onKeyDown={handleKeyDown}
                                />
                                <IconButton
                                    aria-label="delete"
                                    onClick={handleDelete}
                                >
                                    <DeleteCashBinIcon />
                                </IconButton>

                                <IconButton
                                    aria-label="done"
                                    onClick={handleUpdateView}
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
                                                viewType ===
                                                (name as RecastScene)
                                            }
                                            onClick={() => {
                                                if (name === 'table') {
                                                    // The table view is under progress
                                                    return;
                                                }
                                                setViewType(
                                                    name as RecastScene
                                                );
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
            ))}
        </>
    );
};
