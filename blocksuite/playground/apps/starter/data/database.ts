import {
  DatabaseBlockDataSource,
  databaseBlockProperties,
} from '@blocksuite/affine/blocks/database';
import {
  type DatabaseBlockModel,
  type ListType,
  type ParagraphType,
} from '@blocksuite/affine/model';
import { Text, type Workspace } from '@blocksuite/affine/store';
import { groupTraitKey } from '@blocksuite/data-view';
import { propertyPresets } from '@blocksuite/data-view/property-presets';
import { viewPresets } from '@blocksuite/data-view/view-presets';

import type { InitFn } from './utils.js';

export const database: InitFn = (collection: Workspace, id: string) => {
  const doc = collection.createDoc(id);
  const store = doc.getStore();

  doc.load(() => {
    // Add root block and surface block at root level
    const rootId = store.addBlock('affine:page', {
      title: new Text('BlockSuite Playground'),
    });
    store.addBlock('affine:surface', {}, rootId);

    // Add note block inside root block
    const noteId = store.addBlock('affine:note', {}, rootId);
    const pId = store.addBlock('affine:paragraph', {}, noteId);
    const model = store.getModelById(pId);
    if (!model) {
      throw new Error('model is not found');
    }
    const addDatabase = (title: string, group = true) => {
      const databaseId = store.addBlock(
        'affine:database',
        {
          columns: [],
          cells: {},
        },
        noteId
      );
      const database = store.getModelById(databaseId) as DatabaseBlockModel;
      const datasource = new DatabaseBlockDataSource(database);
      datasource.viewManager.viewAdd('table');
      database.props.title = new Text(title);
      const richTextId = datasource.propertyAdd('end', {
        type: databaseBlockProperties.richTextColumnConfig.type,
        name: 'Rich Text',
      });
      Object.values([
        propertyPresets.multiSelectPropertyConfig,
        propertyPresets.datePropertyConfig,
        propertyPresets.numberPropertyConfig,
        databaseBlockProperties.linkColumnConfig,
        propertyPresets.checkboxPropertyConfig,
        propertyPresets.progressPropertyConfig,
      ]).forEach(column => {
        datasource.propertyAdd('end', {
          type: column.type,
          name: column.config.name,
        });
      });
      if (group) {
        const groupTrait =
          datasource.viewManager.currentView$.value?.traitGet(groupTraitKey);
        groupTrait?.changeGroup(database.props.columns[1].id);
      }
      const paragraphTypes: ParagraphType[] = [
        'text',
        'quote',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
      ];
      paragraphTypes.forEach(type => {
        const id = store.addBlock(
          'affine:paragraph',
          { type: type, text: new Text(`Paragraph type ${type}`) },
          databaseId
        );
        if (richTextId) {
          datasource.cellValueChange(
            id,
            richTextId,
            new Text(`Paragraph type ${type}`)
          );
        }
      });
      const listTypes: ListType[] = ['numbered', 'bulleted', 'todo', 'toggle'];

      listTypes.forEach(type => {
        const id = store.addBlock(
          'affine:list',
          { type: type, text: new Text(`List type ${type}`) },
          databaseId
        );
        if (richTextId) {
          datasource.cellValueChange(
            id,
            richTextId,
            new Text(`List type ${type}`)
          );
        }
      });
      // Add a paragraph after database
      store.addBlock('affine:paragraph', {}, noteId);
      store.addBlock('affine:paragraph', {}, noteId);
      store.addBlock('affine:paragraph', {}, noteId);
      store.addBlock('affine:paragraph', {}, noteId);
      store.addBlock('affine:paragraph', {}, noteId);
      datasource.viewManager.viewAdd(viewPresets.kanbanViewMeta.type);

      store.resetHistory();
    };
    // Add database block inside note block
    addDatabase('Database 1', false);
    addDatabase('Database 2');
    addDatabase('Database 3');
    addDatabase('Database 4');
    addDatabase('Database 5');
    addDatabase('Database 6');
    addDatabase('Database 7');
    addDatabase('Database 8');
    addDatabase('Database 9');
    addDatabase('Database 10');
  });
};

database.id = 'database';
database.displayName = 'Database Example';
database.description = 'Database block basic example';
