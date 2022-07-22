import { MuiTooltip as Tooltip } from '@toeverything/components/ui';

import style9 from 'style9';

const styles = style9.create({
    toolbarContainer: {
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
    },
    toolbarItem: {
        padding: '6px',
        margin: '6px 2px',
        ':hover': {
            backgroundColor: '#f4f4f4',
            borderRadius: '4px',
        },
    },
    toolbarItemActive: {
        color: '#502ec4',
    },
    line: {
        margin: '0 8px',
        width: '1px',
        backgroundColor: '#e1e1e1',
    },
});

interface Props {
    data: any[];
}

export default function Toolbar({ data }: Props) {
    return (
        <div className={styles('toolbarContainer')}>
            {data.map((item, index) => {
                const { icon: Icon } = item;
                return item.child ? (
                    <span key={item.key} className={styles('toolbarItem')}>
                        {item.child}
                    </span>
                ) : item.line ? (
                    <div className={styles('line')} key={index}></div>
                ) : (
                    <Tooltip title={item.text} placement="top" key={item.key}>
                        <span
                            key={item.key}
                            className={styles({
                                toolbarItem: true,
                                toolbarItemActive: !!item?.active,
                            })}
                            onClick={() => item?.action(item.key)}
                        >
                            <Icon />
                        </span>
                    </Tooltip>
                );
            })}
        </div>
    );
}
