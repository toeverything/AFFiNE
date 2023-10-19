type ExportsPromiseOrExports =
  | Promise<{ [key: string]: any }>
  | { [key: string]: any };

export async function setupImportsMap(
  map: Map<string, Map<string, any>>,
  imports: Record<string, ExportsPromiseOrExports>
) {
  for (const [key, value] of Object.entries(imports)) {
    let module: { [key: string]: any };
    if (value instanceof Promise) {
      module = await value;
    } else {
      module = value;
    }
    const moduleMap = new Map();
    map.set(key, moduleMap);
    for (const [exportName, exportValue] of Object.entries(module)) {
      moduleMap.set(exportName, exportValue);
    }
  }
}
