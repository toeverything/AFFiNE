import { useState, useMemo, useEffect } from 'react';
import type { DefaultColumnsValue } from '@toeverything/datasource/db-service';
import type { CreateView } from '@toeverything/framework/virgo';
import type { TableColumn, TableRow } from '../../components/table';
import { Table, CustomCell } from '../../components/table';

export const SceneTable = ({ block, columns, editor }: CreateView) => {
    const [rows, set_rows] = useState<TableRow[]>([]);
    const data_columns = useMemo<TableColumn[]>(() => {
        return (columns || [])
            .map(column => {
                if (column.innerColumn) {
                    return null;
                }
                return {
                    dataKey: column.key,
                    label: column.name,
                    type: column.type,
                    width: 150,
                    columnConfig: column,
                };
            })
            .filter(c => Boolean(c));
    }, [columns]);

    useEffect(() => {
        const get_rows = async () => {
            const children = await block.children();
            const children_rows = children.map(child => {
                const properties = child.getProperties();
                return {
                    id: child.id,
                    ...properties,
                    text: properties?.text?.value?.[0]?.text,
                };
            });
            set_rows(children_rows);
        };
        get_rows();
    }, [block]);

    return (
        <div style={{ width: '100%', maxHeight: '500px' }}>
            <Table
                rows={rows}
                columns={data_columns}
                rowKey="id"
                renderCell={props => {
                    return (
                        <CustomCell
                            {...props}
                            onChange={async value => {
                                const block = await editor.getBlockById(
                                    value.row['id'] as string
                                );
                                if (block) {
                                    await block.setProperty(
                                        props.valueKey as keyof DefaultColumnsValue,
                                        value.value as DefaultColumnsValue[keyof DefaultColumnsValue]
                                    );
                                }
                            }}
                        />
                    );
                }}
            />
        </div>
    );
};
