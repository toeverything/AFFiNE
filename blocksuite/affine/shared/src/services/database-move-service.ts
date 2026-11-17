import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

export interface DatabaseMoveService {
  /**
   * Lets the user pick an existing, different doc from the workspace and
   * relocates `databaseId` (currently hosted in `currentDocId`) into that
   * doc — the "Move to another page" action (Story 2.3) on a database's own
   * "..." menu. Every existing `affine:database-ref`/`affine:database-view-ref`
   * (in any doc) pointing at this database is repointed to the new location.
   *
   * Resolves `true` on a successful move, `false` if the user cancelled the
   * picker or the move itself failed.
   */
  moveDatabaseToAnotherDoc: (
    databaseId: string,
    currentDocId: string
  ) => Promise<boolean>;
}

export const DatabaseMoveProvider = createIdentifier<DatabaseMoveService>(
  'AffineDatabaseMoveService'
);

export function DatabaseMoveExtension(
  service: DatabaseMoveService
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(DatabaseMoveProvider, service);
    },
  };
}
