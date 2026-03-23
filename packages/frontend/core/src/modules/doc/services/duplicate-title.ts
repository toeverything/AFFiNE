const DUPLICATED_DOC_TITLE_SUFFIX = /\((\d+)\)$/;

export function getDuplicatedDocTitle(originalTitle: string) {
  const match = originalTitle.match(DUPLICATED_DOC_TITLE_SUFFIX);
  const nextSequence = match ? parseInt(match[1], 10) + 1 : 1;
  return (
    originalTitle.replace(DUPLICATED_DOC_TITLE_SUFFIX, '') + `(${nextSequence})`
  );
}
