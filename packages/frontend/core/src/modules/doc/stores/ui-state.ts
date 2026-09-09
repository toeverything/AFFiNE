let lastScrollPosition = 0;

export const getDocsListScrollPosition = () => lastScrollPosition;

export const setDocsListScrollPosition = (pos: number) => {
  lastScrollPosition = pos;
};
