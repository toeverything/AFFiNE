import { afterEach, describe, expect, test, vi } from 'vitest';

const connect = vi.fn();
const checkpoint = vi.fn();
const poolVacuumInto = vi.fn();
const pathExists = vi.fn();
const remove = vi.fn();
const move = vi.fn();
const realpath = vi.fn();
const copyFile = vi.fn();
const ensureDir = vi.fn();
const copy = vi.fn();
const storeWorkspaceMeta = vi.fn();
const getSpaceDBPath = vi.fn();
const getWorkspaceDBPath = vi.fn();
const getWorkspacesBasePath = vi.fn();
const docValidate = vi.fn();
const docValidateImportSchema = vi.fn();
const docVacuumInto = vi.fn();
const docSetSpaceId = vi.fn();
const sqliteValidate = vi.fn();
const sqliteValidateImportSchema = vi.fn();
const sqliteVacuumInto = vi.fn();
const sqliteClose = vi.fn();
const showOpenDialog = vi.fn();
const showSaveDialog = vi.fn();
const showItemInFolder = vi.fn(async () => undefined);
const getPath = vi.fn();

vi.doMock('nanoid', () => ({
  nanoid: () => 'workspace-1',
}));

vi.doMock('@affine/native', () => {
  const ValidationResult = {
    MissingTables: 'MissingTables',
    MissingDocIdColumn: 'MissingDocIdColumn',
    MissingVersionColumn: 'MissingVersionColumn',
    GeneralError: 'GeneralError',
    Valid: 'Valid',
  };

  return {
    ValidationResult,
    DocStorage: class {
      constructor(private readonly path: string) {}

      validate() {
        return docValidate(this.path);
      }

      validateImportSchema() {
        return docValidateImportSchema(this.path);
      }

      vacuumInto(path: string) {
        return docVacuumInto(this.path, path);
      }

      setSpaceId(spaceId: string) {
        return docSetSpaceId(this.path, spaceId);
      }
    },
    SqliteConnection: class {
      static validate(path: string) {
        return sqliteValidate(path);
      }

      constructor(private readonly path: string) {}

      validateImportSchema() {
        return sqliteValidateImportSchema(this.path);
      }

      vacuumInto(path: string) {
        return sqliteVacuumInto(this.path, path);
      }

      close() {
        return sqliteClose(this.path);
      }
    },
  };
});

vi.doMock('@affine/electron/helper/nbstore', () => ({
  getDocStoragePool: () => ({
    connect,
    checkpoint,
    vacuumInto: poolVacuumInto,
  }),
}));

vi.doMock('@affine/electron/helper/main-rpc', () => ({
  mainRPC: {
    getPath,
    showItemInFolder,
    showOpenDialog,
    showSaveDialog,
  },
}));

vi.doMock('@affine/electron/helper/workspace/meta', () => ({
  getSpaceDBPath,
  getWorkspaceDBPath,
  getWorkspacesBasePath,
}));

vi.doMock('@affine/electron/helper/workspace', () => ({
  storeWorkspaceMeta,
}));

vi.doMock('fs-extra', () => ({
  default: {
    pathExists,
    remove,
    move,
    realpath,
    copyFile,
    ensureDir,
    copy,
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('dialog export', () => {
  test('saveDBFileAs exports a vacuumed backup instead of copying the live db', async () => {
    const dbPath = '/tmp/workspace/storage.db';
    const exportPath = '/tmp/export.affine';
    const tempExportPath = '/tmp/export.affine.workspace-1.tmp';
    const id = '@peer(local);@type(workspace);@id(workspace-1);';

    pathExists.mockImplementation(async path => path === dbPath);
    realpath.mockImplementation(async path => path);
    getSpaceDBPath.mockResolvedValue(dbPath);
    move.mockResolvedValue(undefined);
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: exportPath });

    const { saveDBFileAs } =
      await import('@affine/electron/helper/dialog/dialog');

    const result = await saveDBFileAs(id, 'My Space');

    expect(result).toEqual({ filePath: exportPath });
    expect(connect).toHaveBeenCalledWith(id, dbPath);
    expect(checkpoint).toHaveBeenCalledWith(id);
    expect(poolVacuumInto).toHaveBeenCalledWith(id, tempExportPath);
    expect(move).toHaveBeenCalledWith(tempExportPath, exportPath, {
      overwrite: true,
    });
    expect(remove).not.toHaveBeenCalledWith(exportPath);
    expect(copyFile).not.toHaveBeenCalled();
  });

  test('saveDBFileAs rejects exporting over the live database path', async () => {
    const dbPath = '/tmp/workspace/storage.db';
    const id = '@peer(local);@type(workspace);@id(workspace-1);';

    pathExists.mockResolvedValue(false);
    getSpaceDBPath.mockResolvedValue(dbPath);
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: dbPath });

    const { saveDBFileAs } =
      await import('@affine/electron/helper/dialog/dialog');

    const result = await saveDBFileAs(id, 'My Space');

    expect(result).toEqual({ error: 'DB_FILE_PATH_INVALID' });
    expect(poolVacuumInto).not.toHaveBeenCalled();
    expect(copyFile).not.toHaveBeenCalled();
  });

  test('saveDBFileAs rejects exporting to a symlink alias of the live database', async () => {
    const dbPath = '/tmp/workspace/storage.db';
    const exportPath = '/tmp/alias.affine';
    const id = '@peer(local);@type(workspace);@id(workspace-1);';

    pathExists.mockResolvedValue(true);
    realpath.mockImplementation(async path =>
      path === exportPath ? dbPath : path
    );
    getSpaceDBPath.mockResolvedValue(dbPath);
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: exportPath });

    const { saveDBFileAs } =
      await import('@affine/electron/helper/dialog/dialog');

    const result = await saveDBFileAs(id, 'My Space');

    expect(result).toEqual({ error: 'DB_FILE_PATH_INVALID' });
    expect(poolVacuumInto).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
  });
});

describe('dialog import', () => {
  test('loadDBFile validates schema and vacuums v2 imports into internal storage', async () => {
    const originalPath = '/tmp/import.affine';
    const internalPath = '/app/workspaces/local/workspace-1/storage.db';

    pathExists.mockResolvedValue(true);
    realpath.mockImplementation(async path => path);
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [originalPath],
    });
    getWorkspacesBasePath.mockResolvedValue('/app/workspaces');
    getSpaceDBPath.mockResolvedValue(internalPath);
    docValidate.mockResolvedValue(true);
    docValidateImportSchema.mockResolvedValue(true);
    docVacuumInto.mockResolvedValue(undefined);
    docSetSpaceId.mockResolvedValue(undefined);
    ensureDir.mockResolvedValue(undefined);

    const { loadDBFile } =
      await import('@affine/electron/helper/dialog/dialog');

    const result = await loadDBFile();

    expect(result).toEqual({ workspaceId: 'workspace-1' });
    expect(docValidate).toHaveBeenCalledWith(originalPath);
    expect(docValidateImportSchema).toHaveBeenCalledWith(originalPath);
    expect(docVacuumInto).toHaveBeenCalledWith(originalPath, internalPath);
    expect(docSetSpaceId).toHaveBeenCalledWith(internalPath, 'workspace-1');
    expect(copy).not.toHaveBeenCalled();
  });

  test('loadDBFile rejects v2 imports with unexpected schema objects', async () => {
    const originalPath = '/tmp/import.affine';

    pathExists.mockResolvedValue(true);
    realpath.mockImplementation(async path => path);
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [originalPath],
    });
    getWorkspacesBasePath.mockResolvedValue('/app/workspaces');
    docValidate.mockResolvedValue(true);
    docValidateImportSchema.mockResolvedValue(false);

    const { loadDBFile } =
      await import('@affine/electron/helper/dialog/dialog');

    const result = await loadDBFile();

    expect(result).toEqual({ error: 'DB_FILE_INVALID' });
    expect(docVacuumInto).not.toHaveBeenCalled();
    expect(copy).not.toHaveBeenCalled();
  });

  test('loadDBFile validates schema and vacuums v1 imports into internal storage', async () => {
    const originalPath = '/tmp/import-v1.affine';
    const internalPath = '/app/workspaces/workspace-1/storage.db';

    pathExists.mockResolvedValue(true);
    realpath.mockImplementation(async path => path);
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [originalPath],
    });
    getWorkspacesBasePath.mockResolvedValue('/app/workspaces');
    getWorkspaceDBPath.mockResolvedValue(internalPath);
    docValidate.mockResolvedValue(false);
    sqliteValidate.mockResolvedValue('Valid');
    sqliteValidateImportSchema.mockResolvedValue(true);
    sqliteVacuumInto.mockResolvedValue(undefined);
    ensureDir.mockResolvedValue(undefined);

    const { loadDBFile } =
      await import('@affine/electron/helper/dialog/dialog');

    const result = await loadDBFile();

    expect(result).toEqual({ workspaceId: 'workspace-1' });
    expect(sqliteValidate).toHaveBeenCalledWith(originalPath);
    expect(sqliteValidateImportSchema).toHaveBeenCalledWith(originalPath);
    expect(ensureDir).toHaveBeenCalledWith('/app/workspaces/workspace-1');
    expect(sqliteVacuumInto).toHaveBeenCalledWith(originalPath, internalPath);
    expect(storeWorkspaceMeta).toHaveBeenCalledWith('workspace-1', {
      id: 'workspace-1',
      mainDBPath: internalPath,
    });
    expect(sqliteClose).toHaveBeenCalledWith(originalPath);
    expect(copy).not.toHaveBeenCalled();
  });

  test('loadDBFile closes v1 connection when schema validation fails', async () => {
    const originalPath = '/tmp/import-v1-invalid.affine';

    pathExists.mockResolvedValue(true);
    realpath.mockImplementation(async path => path);
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [originalPath],
    });
    getWorkspacesBasePath.mockResolvedValue('/app/workspaces');
    docValidate.mockResolvedValue(false);
    sqliteValidate.mockResolvedValue('Valid');
    sqliteValidateImportSchema.mockResolvedValue(false);

    const { loadDBFile } =
      await import('@affine/electron/helper/dialog/dialog');

    const result = await loadDBFile();

    expect(result).toEqual({ error: 'DB_FILE_INVALID' });
    expect(sqliteClose).toHaveBeenCalledWith(originalPath);
    expect(sqliteVacuumInto).not.toHaveBeenCalled();
  });

  test('loadDBFile rejects normalized paths inside app data', async () => {
    const selectedPath = '/tmp/import.affine';
    const normalizedPath = '/app/workspaces/local/existing/storage.db';

    pathExists.mockResolvedValue(true);
    realpath.mockImplementation(async path => {
      if (path === selectedPath) {
        return normalizedPath;
      }
      return path;
    });
    showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [selectedPath],
    });
    getWorkspacesBasePath.mockResolvedValue('/app/workspaces');

    const { loadDBFile } =
      await import('@affine/electron/helper/dialog/dialog');

    const result = await loadDBFile();

    expect(result).toEqual({ error: 'DB_FILE_PATH_INVALID' });
    expect(docValidate).not.toHaveBeenCalled();
  });
});
