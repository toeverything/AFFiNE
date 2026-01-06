import { DatabaseBlockDataSource } from '../../../blocks/database/src/data-source';
import { type DatabaseBlockModel } from '@blocksuite/affine-model';
import { BlockMarkdownAdapterExtension } from './block-adapter';
import type { MarkdownBlockNode, MarkdownTableNode } from './type';

// The flavour string for the database block.
// This is typically defined in a corresponding model file (e.g., database-model.ts).
// Assuming 'affine:database' based on conventions.
const DatabaseModelFlavour = 'affine:database';

export const DatabaseBlockMarkdownAdapter = BlockMarkdownAdapterExtension({
  flavour: DatabaseModelFlavour,
  convert: (model: DatabaseBlockModel): MarkdownBlockNode => {
    // Instantiate the DatabaseBlockDataSource to access the block's data.
    const dataSource = new DatabaseBlockDataSource(model);

    const header: string[] = [];
    const rows: string[][] = [];

    // Retrieve property IDs (columns) and their display names to form the table header.
    const propertyIds = dataSource.properties$.value;
    propertyIds.forEach(propId => {
      const propertyName = dataSource.propertyNameGet(propId);
      header.push(propertyName || propId); // Use property name, fall back to ID if name is empty.
    });

    // Retrieve row IDs and then iterate through them to get cell values.
    const rowIds = dataSource.rows$.value;
    rowIds.forEach(rowId => {
      const rowContent: string[] = [];
      propertyIds.forEach(propId => {
        // Get the cell value for the current row and property.
        const cellValue = dataSource.cellValueGet(rowId, propId);
        // Convert the cell value to a string for markdown representation.
        rowContent.push(String(cellValue ?? ''));
      });
      rows.push(rowContent);
    });

    const markdownTable: MarkdownTableNode = {
      type: 'table',
      header,
      rows,
    };

    return markdownTable;
  },
});
