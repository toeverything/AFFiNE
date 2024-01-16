import type { Meta, StoryFn } from '@storybook/react';

import {
  Table,
  TableBody,
  TableBodyRow,
  TableCell,
  TableHead,
  TableHeadRow,
} from './index';

export default {
  title: 'UI/Table',
  component: Table,
} satisfies Meta<typeof Table>;

const Template: StoryFn = args => (
  <Table {...args}>
    <TableHead>
      <TableHeadRow>
        <TableCell>Title 1</TableCell>
        <TableCell>Title 2</TableCell>
        <TableCell>Title 3</TableCell>
        <TableCell>Title 4</TableCell>
      </TableHeadRow>
    </TableHead>

    <TableBody>
      {Array.from({ length: 10 }).map((_, rowNum) => {
        return (
          <TableBodyRow key={`${rowNum}`}>
            {Array.from({ length: 4 }).map((_, colNum) => {
              return (
                <TableCell key={`${rowNum}-${colNum}`}>
                  Cell {rowNum}-{colNum}
                </TableCell>
              );
            })}
          </TableBodyRow>
        );
      })}
    </TableBody>
  </Table>
);

export const Default: StoryFn = Template.bind(undefined);
