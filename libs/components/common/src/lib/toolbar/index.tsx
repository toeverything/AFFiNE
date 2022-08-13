import { MuiTooltip as Tooltip } from '@toeverything/components/ui';
import { styled } from '@toeverything/components/ui';

const toolbarContainerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    lineHeight: 1,
    zIndex: 1,
    padding: '0 8px',
    backgroundColor: '#ffffff',
    border: '1px solid #e1e1e1',
    boxShadow: '0px 14px 24px rgba(51, 51, 51, 0.08)',
    borderRadius: '4px',
    color: '#333',
    fontSize: '16px',
    cursor: 'pointer',
};

const lineStyle: React.CSSProperties = {
    margin: '0 8px',
    width: '1px',
    backgroundColor: '#e1e1e1',
};

const StyledToolbarItem = styled('span')<{ active: boolean }>(({ active }) => {
    return {
        padding: '6px',
        margin: '6px 2px',
        '&:hover': {
            backgroundColor: '#f4f4f4',
            borderRadius: '4px',
        },
        ...(active ? { color: '#502ec4' } : {}),
    };
});

interface Props {
    data: any[];
}

export default function Toolbar({ data }: Props) {
    return (
        <div style={toolbarContainerStyle}>
            {data.map((item, index) => {
                const { icon: Icon } = item;
                return item.child ? (
                    <StyledToolbarItem active={false} key={item.key}>
                        {item.child}
                    </StyledToolbarItem>
                ) : item.line ? (
                    <div style={lineStyle} key={index}></div>
                ) : (
                    <Tooltip title={item.text} placement="top" key={item.key}>
                        <StyledToolbarItem
                            active={item.active}
                            key={item.key}
                            onClick={() => item?.action(item.key)}
                        >
                            <Icon />
                        </StyledToolbarItem>
                    </Tooltip>
                );
            })}
        </div>
    );
}
