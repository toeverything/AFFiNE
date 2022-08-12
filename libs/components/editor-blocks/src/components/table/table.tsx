import type { ReactNode } from 'react';
import { BasicTable } from './basic-table';
import type { BasicTableProps } from './basic-table';

interface TableProps extends BasicTableProps {
    addon?: ReactNode;
}

export const Table = ({ addon, ...props }: TableProps) => {
    return (
        <div>
            {addon}
            <BasicTable {...props} />
        </div>
    );
};
