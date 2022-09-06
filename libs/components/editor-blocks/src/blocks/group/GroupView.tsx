import {
    addNewGroup,
    LINE_GAP,
    RecastScene,
    TAG_GAP,
    useCurrentView,
    useOnSelect,
} from '@toeverything/components/editor-core';
import { styled } from '@toeverything/components/ui';
import type { CreateView } from '@toeverything/framework/virgo';
import type { ComponentType } from 'react';
import { useState } from 'react';
import { GroupMenuWrapper } from './group-menu';
import { SceneKanban } from './scene-kanban';
import { ScenePage } from './ScenePage';
import { SceneTable } from './SceneTable';

const SceneMap: Record<RecastScene, ComponentType<CreateView>> = {
    page: ScenePage,
    table: SceneTable,
    kanban: SceneKanban,
} as const;

const GroupActionWrapper = styled('div')(({ theme }) => ({
    height: '30px',
    display: 'flex',
    visibility: 'hidden',
    fontSize: theme.affine.typography.xs.fontSize,
    color: theme.affine.palette.icons,
    opacity: 0.6,
    '.line': {
        flex: 1,
        height: '15px',
        borderBottom: `1px solid ${theme.affine.palette.icons}`,
    },
    '.add-button': {
        textAlign: 'center',
        cursor: 'pointer',
        // width: '130px',
        padding: '0 20px',
        height: '30px',
        lineHeight: '30px',
        span: {
            paddingRight: '10px',
        },
    },
}));

const GroupBox = styled('div')({
    '&:hover': {
        [GroupActionWrapper.toString()]: {
            visibility: 'visible',
        },
    },
});

const GroupContainer = styled('div')<{ isSelect?: boolean }>(
    ({ isSelect, theme }) => ({
        background: theme.affine.palette.white,
        border: '2px solid rgba(236,241,251,.5)',
        padding: `15px 16px ${LINE_GAP - TAG_GAP * 2}px 16px`,
        borderRadius: '10px',
        ...(isSelect
            ? {
                  boxShadow:
                      '0px 0px 5px 5px rgba(98, 137, 255, 0.25), 0px 0px 5px 5px #E3EAFF',
              }
            : {
                  '&:hover': {
                      boxShadow: theme.affine.shadows.shadow1,
                  },
              }),
    })
);

export const GroupView = (props: CreateView) => {
    const { block, editor } = props;
    const [currentView] = useCurrentView();
    const [groupIsSelect, setGroupIsSelect] = useState(false);

    useOnSelect(block.id, (groupIsSelect: boolean) => {
        setGroupIsSelect(groupIsSelect);
    });

    const addGroup = async () => {
        addNewGroup(editor, block, true);
    };

    const View = SceneMap[currentView.type];
    if (!View) {
        return <>Group scene not found: {currentView.type}!</>;
    }

    return (
        <GroupMenuWrapper block={block} editor={editor}>
            <GroupBox>
                <GroupContainer isSelect={groupIsSelect}>
                    <View {...props} />
                </GroupContainer>

                {editor.isEdgeless ? null : (
                    <GroupAction onAddGroup={addGroup} />
                )}
            </GroupBox>
        </GroupMenuWrapper>
    );
};

const GroupAction = ({ onAddGroup }: { onAddGroup: () => void }) => {
    return (
        <GroupActionWrapper>
            <div className="line" />
            <div className="add-button" onClick={onAddGroup}>
                <span>+</span>
                <span>Add New Group Here</span>
            </div>
            <div className="line" />
        </GroupActionWrapper>
    );
};
