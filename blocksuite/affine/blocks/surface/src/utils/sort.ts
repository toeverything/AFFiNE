export function loadingSort<T extends { id: string; deps: string[] }>(
  elements: T[]
) {
  const graph = new Map<string, string[]>();
  const outDegree = new Map<string, number>();
  const sortedOrder = [];
  const map = new Map<string, T>();

  elements.forEach(element => {
    outDegree.set(element.id, 0);
    map.set(element.id, element);
  });

  elements.forEach(element => {
    element.deps.forEach(depId => {
      if (outDegree.has(depId)) {
        graph.has(depId)
          ? graph.get(depId)!.push(element.id)
          : graph.set(depId, [element.id]);
        outDegree.set(element.id, outDegree.get(element.id)! + 1);
      }
    });
  });

  const queue: string[] = [];

  for (const [id, degree] of outDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    sortedOrder.push(node);

    const deps = graph.get(node) || [];
    deps.forEach(depId => {
      if (outDegree.has(depId)) {
        outDegree.set(depId, outDegree.get(depId)! - 1);

        if (outDegree.get(depId) === 0) {
          queue.push(depId);
        }
      }
    });
  }

  return sortedOrder.map(id => map.get(id)!);
}

export function sortIndex(
  a: { id: string; index: string },
  b: { id: string; index: string },
  groupIndexMap: Map<string, { id: string; index: string }>
) {
  const aGroupIndex = groupIndexMap.get(a.id);
  const bGroupIndex = groupIndexMap.get(b.id);

  if (aGroupIndex && bGroupIndex) {
    return aGroupIndex.id === bGroupIndex.id
      ? a.index === b.index
        ? 0
        : a.index > b.index
          ? 1
          : -1
      : aGroupIndex.index > bGroupIndex.index
        ? 1
        : -1;
  }

  if (aGroupIndex) {
    return aGroupIndex.id === b.id
      ? 1
      : aGroupIndex.index === b.index
        ? 0
        : aGroupIndex.index > b.index
          ? 1
          : -1;
  }

  if (bGroupIndex) {
    return a.id === bGroupIndex.id
      ? -1
      : a.index === bGroupIndex.index
        ? 0
        : a.index > bGroupIndex.index
          ? 1
          : -1;
  }

  return a.index === b.index ? 0 : a.index > b.index ? 1 : -1;
}
