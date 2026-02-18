/**
 * @vitest-environment happy-dom
 */
import type { ColumnDef } from '@tanstack/react-table';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { SharedDataTable } from './data-table';

const { DataTablePaginationMock } = vi.hoisted(() => ({
  DataTablePaginationMock: vi.fn(({ disabled }: { disabled?: boolean }) => (
    <div data-disabled={disabled ? 'true' : 'false'} data-testid="pagination" />
  )),
}));

vi.mock('./data-table-pagination', () => ({
  DataTablePagination: DataTablePaginationMock,
}));

type Row = { id: string; name: string };

const columns: ColumnDef<Row>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => row.original.name,
  },
];

describe('SharedDataTable', () => {
  afterEach(() => {
    cleanup();
    DataTablePaginationMock.mockClear();
  });

  test('renders token-aligned table shell and row data', () => {
    const { container } = render(
      <SharedDataTable
        columns={columns}
        data={[{ id: '1', name: 'Alice' }]}
        totalCount={1}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        onPaginationChange={vi.fn()}
      />
    );

    expect(screen.queryByText('Alice')).not.toBeNull();

    const shell = container.querySelector('.rounded-xl');
    expect(shell).not.toBeNull();
    expect(shell?.className).toContain('border-border');
    expect(shell?.className).toContain('bg-card');
    expect(shell?.className).toContain('shadow-1');
  });

  test('shows loading overlay and disables pagination while loading', () => {
    render(
      <SharedDataTable
        columns={columns}
        data={[{ id: '1', name: 'Alice' }]}
        totalCount={1}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        onPaginationChange={vi.fn()}
        loading={true}
      />
    );

    expect(screen.queryByText('Loading...')).not.toBeNull();
    expect(screen.getByTestId('pagination').dataset.disabled).toBe('true');
  });

  test('renders empty state when there is no data', () => {
    render(
      <SharedDataTable
        columns={columns}
        data={[]}
        totalCount={0}
        pagination={{ pageIndex: 0, pageSize: 10 }}
        onPaginationChange={vi.fn()}
      />
    );

    expect(screen.queryByText('No results.')).not.toBeNull();
  });
});
