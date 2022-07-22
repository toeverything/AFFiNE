import {
    addNewGroup,
    RecastScene,
    useOnSelect,
    useRecastBlockScene,
} from '@toeverything/components/editor-core';
import { SceneKanban } from './scene-kanban';
import { ScenePage } from './ScenePage';
import { SceneTable } from './SceneTable';
import { GroupMenuWrapper } from './GroupMenu';
import { styled } from '@toeverything/components/ui';
import { useState } from 'react';
import type { FC, ComponentType } from 'react';
import type { CreateView } from '@toeverything/framework/virgo';

const SceneMap: Record<RecastScene, ComponentType<CreateView>> = {
    page: ScenePage,
    table: SceneTable,
    kanban: SceneKanban,
    whiteboard: ScenePage,
} as const;

const GroupBox = styled('div')(({ theme }) => {
    return {
        '&:hover': {
            // Workaround referring to other components
            // See https://emotion.sh/docs/styled#targeting-another-emotion-component
            // [GroupActionWrapper.toString()]: {},
            '& > *': {
                visibility: 'visible',
            },
        },
    };
});

const GroupActionWrapper = styled('div')(({ theme }) => ({
    height: '30px',
    display: 'flex',
    visibility: 'hidden',
    fontSize: theme.affine.typography.xs.fontSize,
    color: theme.affine.palette.icons,
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

const GroupContainer = styled('div')<{ isSelect?: boolean }>(
    ({ isSelect, theme }) => ({
        background: theme.affine.palette.white,
        border: '2px solid #ECF1FB',
        boxShadow: isSelect
            ? '0px 0px 5px 5px rgba(98, 137, 255, 0.25), 0px 0px 5px 5px #E3EAFF;'
            : '#none',
        padding: '15px 12px',
        borderRadius: '10px',
        '&:hover': {
            // borderColor: 'none',
            boxShadow: '0px 1px 10px rgb(152 172 189 / 60%)',
        },
    })
);

export const GroupView: FC<CreateView> = props => {
    const { block, editor } = props;
    const { scene } = useRecastBlockScene();
    const [groupIsSelect, setGroupIsSelect] = useState(false);

    useOnSelect(block.id, (groupIsSelect: boolean) => {
        setGroupIsSelect(groupIsSelect);
    });

    const addGroup = async () => {
        addNewGroup(editor, block, true);
    };

    const View = SceneMap[scene];
    if (!View) {
        return <>Group scene not found: {scene}!</>;
    }

    return (
        <GroupMenuWrapper block={block} editor={editor}>
            <GroupBox>
                <GroupContainer isSelect={groupIsSelect}>
                    <View {...props} />
                </GroupContainer>

                {editor.isWhiteboard ? null : (
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
