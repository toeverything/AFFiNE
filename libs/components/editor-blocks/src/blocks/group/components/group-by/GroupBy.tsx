import { styled } from '@toeverything/components/ui';
import { useRecastKanbanGroupBy } from '@toeverything/components/editor-core';
import { StatusIcon } from '@toeverything/components/icons';
import { Panel } from '../Panel';
import type { RecastPropertyId } from '@toeverything/components/editor-core';

const panelStyle = {
    padding: '8px 4px',
};

const disabledStyle = {
    fontSize: 12,
    lineHeight: '18px',
    color: '#98ACBD',
};

const activeStyle = {
    color: '#3E6FDB',
};

const hoverStyle = {
    borderRadius: 5,
    backgroundColor: '#F5F7F8',
};

const Item = styled('div')<{ active?: boolean; disabled?: unknown }>(props => {
    const { active } = props;

    return {
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'flex-start',
        padding: '6px 12px',
        minWidth: 120,
        fontSize: 14,
        lineHeight: '20px',
        color: '#4C6275',
        '&:hover': {
            ...(!('disabled' in props) && hoverStyle),
        },
        ...('disabled' in props && disabledStyle),
        ...(active && activeStyle),
    };
});

const Content = styled('div')({
    display: 'flex',
    alignItems: 'center',
    '& > div': {
        marginLeft: 12,
    },
});

const GroupBy = ({ closePanel }: { closePanel: () => void }) => {
    const { supportedGroupBy, setGroupBy, groupBy } = useRecastKanbanGroupBy();

    const onChange = (value: string) => {
        (async () => {
            await setGroupBy(value as RecastPropertyId);
        })();
        closePanel();
    };

    return (
        <Panel style={panelStyle}>
            <Item disabled>
                <div>COLUMN</div>
            </Item>
            {supportedGroupBy.map(({ name, id }) => (
                <Item
                    active={groupBy.id === id}
                    key={id}
                    onClick={() => onChange(id)}
                >
                    <Content>
                        <StatusIcon fontSize="small" />
                        <div>
                            {name.slice(0, 1).toUpperCase()}
                            {name.slice(1)}
                        </div>
                    </Content>
                </Item>
            ))}
        </Panel>
    );
};

export { GroupBy };
