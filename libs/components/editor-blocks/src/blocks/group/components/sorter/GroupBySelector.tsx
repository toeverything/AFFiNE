import { styled, OldSelect } from '@toeverything/components/ui';
import { useRecastKanbanGroupBy } from '@toeverything/components/editor-core';
import type { CSSProperties } from 'react';
import type { RecastPropertyId } from '@toeverything/components/editor-core';

const extraStyle: CSSProperties = {
    height: 32,
    border: '1px solid #E0E6EB',
    borderRadius: 5,
    padding: '0 12px',
};

const StyledGroupSelector = styled('div')({
    display: 'flex',
    alignItems: 'center',
    padding: '0 8px',
    fontWeight: 400,
    fontSize: 16,
    color: '#3A4C5C',
    '& select': {
        margin: '12px',
        fontSize: 14,
    },
});

const GroupBySelector = () => {
    const { supportedGroupBy, setGroupBy, groupBy } = useRecastKanbanGroupBy();
    /* groupBy config */
    const options = supportedGroupBy.map(({ name, id }) => ({
        label: name,
        value: id,
    }));

    const onChange = (value: string) => {
        (async () => {
            await setGroupBy(value as RecastPropertyId);
        })();
    };

    return (
        <StyledGroupSelector>
            Group by
            <OldSelect
                extraStyle={{ ...extraStyle }}
                value={groupBy as unknown as string}
                onChange={onChange}
                options={options}
            />
        </StyledGroupSelector>
    );
};

export { GroupBySelector };
