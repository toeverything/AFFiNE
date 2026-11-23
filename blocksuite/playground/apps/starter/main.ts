import '../../style.css';

import * as databaseBlocks from '@blocksuite/affine/blocks/database';
import * as noteBlocks from '@blocksuite/affine/blocks/note';
import * as globalUtils from '@blocksuite/affine/global/utils';
import * as services from '@blocksuite/affine/shared/services';
import * as blockStd from '@blocksuite/affine/std';
import * as store from '@blocksuite/affine/store';
import * as affineModel from '@blocksuite/affine-model';
import * as editor from '@blocksuite/integration-test';
import { effects as itEffects } from '@blocksuite/integration-test/effects';
import { getTestStoreManager } from '@blocksuite/integration-test/store';

import { setupEdgelessTemplate } from '../_common/setup.js';
import { effects as commentEffects } from '../comment/effects.js';
import {
  createStarterDocCollection,
  initStarterDocCollection,
} from './utils/collection.js';
import { mountDefaultDocEditor } from './utils/setup-playground';
import { prepareTestApp } from './utils/test';

itEffects();
const storeManager = getTestStoreManager();
commentEffects();

async function main() {
  if (window.collection) return;

  setupEdgelessTemplate();

  const params = new URLSearchParams(location.search);
  const room = params.get('room') ?? Math.random().toString(16).slice(2, 8);
  const isE2E = room.startsWith('playwright');
  const collection = createStarterDocCollection(storeManager);

  if (isE2E) {
    Object.defineProperty(window, '$blocksuite', {
      value: Object.freeze({
        store,
        blocks: {
          database: databaseBlocks,
          note: noteBlocks,
        },
        global: { utils: globalUtils },
        services,
        editor,
        blockStd: blockStd,
        affineModel: affineModel,
      }),
    });
    await prepareTestApp(collection);

    return;
  }

  await initStarterDocCollection(collection);
  await mountDefaultDocEditor(collection);
}

main().catch(console.error);
