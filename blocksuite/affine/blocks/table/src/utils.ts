export const cleanSelection = () => {
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
  }
};

export const compareByOrder = <T extends { order: string }>(
  a: T,
  b: T
): number => (a.order === b.order ? 0 : a.order > b.order ? 1 : -1);
