import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import type { DeltaInsert } from '@blocksuite/store';
import { expect, type Page } from '@playwright/test';

import {
  enterPlaygroundRoom,
  getEditorHostLocator,
  waitNextFrame,
} from '../utils/actions/index.js';
import { scoped, test } from '../utils/playwright.js';

const createCalendarDatabase = async (
  page: Page,
  options?: {
    withDateColumn?: boolean;
    mapDateColumn?: boolean;
    readonly?: boolean;
    rowCount?: number;
    linkedDocTitle?: string;
    withEndDateColumn?: boolean;
  }
) => {
  return page.evaluate(
    ({
      withDateColumn,
      mapDateColumn,
      readonly,
      rowCount,
      linkedDocTitle,
      withEndDateColumn,
    }) => {
      const { doc } = window;
      const rows = rowCount ?? 1;
      const linkedDocId = linkedDocTitle ? `doc:${linkedDocTitle}` : undefined;
      doc.captureSync();
      const rootId = doc.addBlock('affine:page', {
        title: new window.$blocksuite.store.Text(),
      });
      const noteId = doc.addBlock('affine:note', {}, rootId);
      const databaseId = doc.addBlock(
        'affine:database',
        {
          title: new window.$blocksuite.store.Text('Calendar database'),
        },
        noteId
      );
      if (linkedDocId && linkedDocTitle) {
        const linkedDoc = window.collection.createDoc(linkedDocId).getStore();
        linkedDoc.load();
        const linkedRootId = linkedDoc.addBlock('affine:page', {
          title: new window.$blocksuite.store.Text(linkedDocTitle),
        });
        linkedDoc.addBlock('affine:surface', {}, linkedRootId);
        linkedDoc.addBlock('affine:note', {}, linkedRootId);
      }
      const rowIds = Array.from({ length: rows }, (_, index) => {
        const text =
          index === 0 && linkedDocId
            ? new window.$blocksuite.store.Text([
                {
                  insert: ' ',
                  attributes: {
                    reference: {
                      type: 'LinkedPage',
                      pageId: linkedDocId,
                    },
                  },
                },
              ] as unknown as DeltaInsert[])
            : new window.$blocksuite.store.Text(`Task ${index + 1}`);
        return doc.addBlock(
          'affine:paragraph',
          {
            type: 'text',
            text,
          },
          databaseId
        );
      });
      const rowId = rowIds[0];
      const model = doc.getModelById(databaseId) as DatabaseBlockModel;
      const datasource =
        new window.$blocksuite.blocks.database.DatabaseBlockDataSource(model);
      const dateColumnId = withDateColumn
        ? datasource.propertyAdd('end', {
            type: 'date',
            name: 'Date',
          })
        : undefined;
      const endDateColumnId = withEndDateColumn
        ? datasource.propertyAdd('end', {
            type: 'date',
            name: 'End Date',
          })
        : undefined;
      if (dateColumnId) {
        for (const id of rowIds) {
          datasource.cellValueChange(
            id,
            dateColumnId,
            new Date('2026-05-15T00:00:00').getTime()
          );
          if (endDateColumnId) {
            datasource.cellValueChange(
              id,
              endDateColumnId,
              new Date('2026-05-17T00:00:00').getTime()
            );
          }
        }
      }
      const viewId = datasource.viewManager.viewAdd('calendar');
      datasource.viewManager.setCurrentView(viewId);
      if (dateColumnId && mapDateColumn) {
        const view = datasource.viewManager.viewGet(viewId) as
          | {
              setDateColumn: (propertyId: string) => void;
              setEndDateColumn: (propertyId: string) => void;
            }
          | undefined;
        view?.setDateColumn(dateColumnId);
        if (endDateColumnId) {
          view?.setEndDateColumn(endDateColumnId);
        }
      }
      if (readonly) {
        doc.readonly = true;
      }
      doc.captureSync();
      return {
        databaseId,
        rowId,
        rowIds,
        dateColumnId,
        endDateColumnId,
        viewId,
        linkedDocId,
      };
    },
    options ?? {}
  );
};

test(scoped`database calendar setup and row interactions`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  const ids = await createCalendarDatabase(page, {
    withDateColumn: true,
    mapDateColumn: false,
  });

  const editorHost = getEditorHostLocator(page);
  await expect(editorHost.getByTestId('dv-calendar-view')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Select or create date property' })
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'Select or create date property' })
    .click();
  await page.getByText('Date', { exact: true }).click();
  await expect(
    page.locator('.calendar-entry').filter({ hasText: 'Task 1' })
  ).toBeVisible();

  await page.locator('.calendar-entry').filter({ hasText: 'Task 1' }).click();
  await expect(page.locator('affine-data-view-record-detail')).toBeVisible();

  await page.evaluate(({ databaseId, dateColumnId }) => {
    if (!dateColumnId) {
      throw new Error('dateColumnId is required');
    }
    const model = window.doc.getModelById(databaseId) as DatabaseBlockModel;
    const datasource =
      new window.$blocksuite.blocks.database.DatabaseBlockDataSource(model);
    datasource.propertyDelete(dateColumnId);
  }, ids);
  await expect(
    page.getByRole('button', { name: 'Select or create date property' })
  ).toBeVisible();
});

test(
  scoped`database calendar creates date property from setup`,
  async ({ page }) => {
    await enterPlaygroundRoom(page);
    await createCalendarDatabase(page);

    await page
      .getByRole('button', { name: 'Select or create date property' })
      .click();
    await page.getByText('Create date property', { exact: true }).click();

    await expect(
      page.getByRole('button', { name: 'Select or create date property' })
    ).toBeHidden();
  }
);

test(scoped`database calendar creates row from empty day`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  const ids = await createCalendarDatabase(page, {
    withDateColumn: true,
    mapDateColumn: true,
  });

  const targetDay = page
    .locator('.calendar-day')
    .filter({ has: page.locator('.calendar-day-number', { hasText: '20' }) })
    .first();
  await targetDay.hover();
  await targetDay.getByRole('button', { name: '+ New row' }).click();

  await expect(page.locator('affine-data-view-record-detail')).toBeVisible();

  const expectedDate = await page.evaluate(() =>
    new Date('2026-05-20T00:00:00').getTime()
  );
  await expect
    .poll(() =>
      page.evaluate(
        ({ databaseId, dateColumnId, expectedDate }) => {
          if (!dateColumnId) {
            throw new Error('dateColumnId is required');
          }
          const model = window.doc.getModelById(
            databaseId
          ) as DatabaseBlockModel;
          const datasource =
            new window.$blocksuite.blocks.database.DatabaseBlockDataSource(
              model
            );
          return datasource.rows$.value.some(
            rowId =>
              datasource.cellValueGet(rowId, dateColumnId) === expectedDate
          );
        },
        { ...ids, expectedDate }
      )
    )
    .toBe(true);
});

test(
  scoped`database calendar opens linked doc row via row detail`,
  async ({ page }) => {
    await enterPlaygroundRoom(page);
    const ids = await createCalendarDatabase(page, {
      withDateColumn: true,
      mapDateColumn: true,
      linkedDocTitle: 'Calendar linked doc',
    });

    await page.evaluate(({ databaseId }) => {
      const database = document.querySelector(
        `affine-database[data-block-id="${databaseId}"]`
      ) as any;
      database.dataViewRootLogic.value.openDetailPanel = ({
        rowId,
      }: {
        rowId: string;
      }) => {
        (window as any).__calendarRowOpen = rowId;
      };
    }, ids);

    const entry = page.locator('.calendar-entry.row').first();
    await expect(entry).toContainText('Calendar linked doc');
    await entry.click();

    await expect
      .poll(() => page.evaluate(() => (window as any).__calendarRowOpen))
      .toBe(ids.rowId);
  }
);

test(
  scoped`database calendar hides setup create action in readonly`,
  async ({ page }) => {
    await enterPlaygroundRoom(page);
    await createCalendarDatabase(page, { readonly: true });

    await page
      .getByRole('button', { name: 'Select or create date property' })
      .click();

    await expect(
      page.getByText('Create date property', { exact: true })
    ).toBeHidden();

    await page.evaluate(() => {
      window.doc.readonly = false;
    });
  }
);

test(scoped`database calendar shows all day entries`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await createCalendarDatabase(page, {
    withDateColumn: true,
    mapDateColumn: true,
    rowCount: 4,
  });

  const may15 = page
    .locator('.calendar-day')
    .filter({ has: page.locator('.calendar-day-number', { hasText: '15' }) })
    .first();

  await expect(may15.locator('.calendar-entry')).toHaveCount(4);
  await expect(may15.locator('.calendar-overflow')).toHaveCount(0);
});

test(
  scoped`database calendar drag updates date cell and readonly disables drag`,
  async ({ page }) => {
    await enterPlaygroundRoom(page);
    const ids = await createCalendarDatabase(page, {
      withDateColumn: true,
      mapDateColumn: true,
    });
    await waitNextFrame(page);

    const entry = page.locator('.calendar-entry').filter({ hasText: 'Task 1' });
    const targetDay = page
      .locator('.calendar-day')
      .filter({ has: page.locator('.calendar-day-number', { hasText: '20' }) })
      .first();
    await entry.dragTo(targetDay);

    const expectedDate = await page.evaluate(() =>
      new Date('2026-05-20T00:00:00').getTime()
    );
    await expect
      .poll(async () =>
        page.evaluate(({ databaseId, rowId, dateColumnId }) => {
          if (!dateColumnId) {
            throw new Error('dateColumnId is required');
          }
          const model = window.doc.getModelById(
            databaseId
          ) as DatabaseBlockModel;
          const datasource =
            new window.$blocksuite.blocks.database.DatabaseBlockDataSource(
              model
            );
          return datasource.cellValueGet(rowId, dateColumnId);
        }, ids)
      )
      .toBe(expectedDate);

    const readonlyIds = await createCalendarDatabase(page, {
      withDateColumn: true,
      mapDateColumn: true,
      readonly: true,
    });
    await waitNextFrame(page);
    const readonlyCalendar = page.getByTestId('dv-calendar-view').last();
    await expect(
      readonlyCalendar
        .locator('.calendar-entry')
        .filter({ hasText: 'Task 1' })
        .first()
    ).toHaveAttribute('draggable', 'false');

    await page.evaluate(() => {
      window.doc.readonly = false;
    });
    expect(readonlyIds.databaseId).toBeTruthy();
  }
);

test(
  scoped`database calendar drags row range preserving duration`,
  async ({ page }) => {
    await enterPlaygroundRoom(page);
    const ids = await createCalendarDatabase(page, {
      withDateColumn: true,
      withEndDateColumn: true,
      mapDateColumn: true,
    });
    await waitNextFrame(page);

    const entry = page
      .locator('.calendar-entry.row')
      .filter({ hasText: 'Task 1' })
      .first();
    const targetDay = page
      .locator('.calendar-day')
      .filter({ has: page.locator('.calendar-day-number', { hasText: '20' }) })
      .first();
    await entry.dragTo(targetDay);

    const expectedStart = await page.evaluate(() =>
      new Date('2026-05-20T00:00:00').getTime()
    );
    const expectedEnd = await page.evaluate(() =>
      new Date('2026-05-22T00:00:00').getTime()
    );
    await expect
      .poll(() =>
        page.evaluate(
          ({ databaseId, rowId, dateColumnId, endDateColumnId }) => {
            if (!dateColumnId || !endDateColumnId) {
              throw new Error('date columns are required');
            }
            const model = window.doc.getModelById(
              databaseId
            ) as DatabaseBlockModel;
            const datasource =
              new window.$blocksuite.blocks.database.DatabaseBlockDataSource(
                model
              );
            return [
              datasource.cellValueGet(rowId, dateColumnId),
              datasource.cellValueGet(rowId, endDateColumnId),
            ];
          },
          ids
        )
      )
      .toEqual([expectedStart, expectedEnd]);
  }
);

test(scoped`database calendar resizes row range end date`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  const ids = await createCalendarDatabase(page, {
    withDateColumn: true,
    withEndDateColumn: true,
    mapDateColumn: true,
  });
  await waitNextFrame(page);

  const entry = page
    .locator('.calendar-entry.row')
    .filter({ hasText: 'Task 1' })
    .filter({ has: page.locator('.calendar-resize-handle.right') })
    .first();
  await entry.hover();
  const handle = entry.locator('.calendar-resize-handle.right');
  const targetDay = page
    .locator('.calendar-day')
    .filter({ has: page.locator('.calendar-day-number', { hasText: '20' }) })
    .first();
  const handleBox = await handle.boundingBox();
  const targetBox = await targetDay.boundingBox();
  if (!handleBox || !targetBox) {
    throw new Error('resize target is not visible');
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 16);
  await page.mouse.up();

  const expectedEnd = await page.evaluate(() =>
    new Date('2026-05-20T00:00:00').getTime()
  );
  await expect
    .poll(() =>
      page.evaluate(({ databaseId, rowId, endDateColumnId }) => {
        if (!endDateColumnId) {
          throw new Error('endDateColumnId is required');
        }
        const model = window.doc.getModelById(databaseId) as DatabaseBlockModel;
        const datasource =
          new window.$blocksuite.blocks.database.DatabaseBlockDataSource(model);
        return datasource.cellValueGet(rowId, endDateColumnId);
      }, ids)
    )
    .toBe(expectedEnd);
});
