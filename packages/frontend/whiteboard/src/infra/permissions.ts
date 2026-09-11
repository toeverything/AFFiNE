/**
 * Product RBAC for board widgets (plan §6.8).
 * DocRole.Editor+ already maps to `store.readonly === false` via Doc_Update.
 * Block-level ACL is not promised in v1; `lockedBySelf` is a soft lock only.
 */

export function isBoardReadonly(store: { readonly?: boolean } | null | undefined) {
  return !!store?.readonly;
}

export function canEditBoardWidgets(
  store: { readonly?: boolean } | null | undefined,
  model?: { lockedBySelf?: boolean } | null
) {
  if (isBoardReadonly(store)) return false;
  if (model?.lockedBySelf) return false;
  return true;
}
