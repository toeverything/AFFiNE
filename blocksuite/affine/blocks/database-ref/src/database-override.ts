import { DatabaseBlockComponent } from '@blocksuite/affine-block-database';

let installed = false;

/**
 * `DatabaseBlockComponent.listenFullWidthChange()` measures
 * `this.getBoundingClientRect().left - this.host.getBoundingClientRect().left`
 * to compute `virtualPadding$` — a "how far can this database bleed past
 * its note's normal text-column margins" value, used deep inside the
 * Kanban view's own render (`kanban-view-ui-logic.ts`: a wrapper div gets
 * `marginLeft/marginRight: -virtualPadding$`, `paddingLeft/paddingRight:
 * virtualPadding$`) to let wide content use much more horizontal room than
 * a text column would normally offer.
 *
 * For a real, top-level database, `this.host` is the true, full-width
 * page host, so this works correctly. For the nested `affine-database`
 * this package renders (inside `database-ref-block.ts`'s own nested
 * `BlockStdScope`), `this.host` is that nested scope's own host instead —
 * mounted with ~0 extra offset from the `database-ref` wrapper — so the
 * measured bleed comes out wrong (near 0), and the Kanban board stays
 * confined to the wrapper's narrow text-column width instead of the wide
 * layout a normal, non-referenced database gets.
 *
 * An earlier attempt tried overriding the `affine:database` view
 * registration with a subclass (the same technique used for
 * `affine:page`, see `preview-root.ts`) — but that changes the actual
 * *tag name* the block renders as, since a custom element can't be
 * re-registered under the tag it already owns. That broke everything that
 * looks for `<affine-database>` specifically (this package's own tests,
 * and any `affine-database`-keyed CSS). Patching the shared class's
 * method directly, scoped by checking whether *this specific instance* is
 * rendered inside one of our wrappers, keeps the real tag intact and only
 * changes behavior for the nested case; a real, non-referenced database's
 * `listenFullWidthChange()` runs completely unaffected.
 * `database-ref-block.ts`'s own `_syncFullWidthBleed()` drives
 * `virtualPadding$` directly for the nested instance instead, using a
 * measurement against the real outer page host, which it — unlike the
 * nested database — actually has access to.
 */
export function installNestedDatabaseFullWidthGuard() {
  if (installed) return;
  installed = true;

  const original = DatabaseBlockComponent.prototype.listenFullWidthChange;

  DatabaseBlockComponent.prototype.listenFullWidthChange = function (
    this: DatabaseBlockComponent
  ) {
    // `affine:database-view-ref` (a sibling reference block with its own
    // local view/filter config, `@blocksuite/affine-block-database-view-ref`)
    // nests a real `affine-database` the exact same way this package does,
    // and drives `virtualPadding$` directly from its own `_syncFullWidthBleed`
    // for the identical reason — same guard needed here too, or the
    // original (broken-when-nested) measurement would fight it.
    if (
      this.closest('affine-database-ref') ||
      this.closest('affine-database-view-ref')
    ) {
      return;
    }
    original.call(this);
  };
}
