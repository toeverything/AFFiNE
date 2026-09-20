export type DotToUnderline<T extends string> =
  T extends `${infer Prefix}.${infer Suffix}`
    ? `${Prefix}_${DotToUnderline<Suffix>}`
    : T;

export function mapPermissionsToGraphqlPermissions<A extends string>(
  permission: Record<A, boolean>
): Record<DotToUnderline<A>, boolean> {
  return Object.fromEntries(
    Object.entries(permission).map(([key, value]) => [
      key.replaceAll('.', '_'),
      value,
    ])
  ) as Record<DotToUnderline<A>, boolean>;
}
