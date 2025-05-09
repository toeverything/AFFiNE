import type { BlockSnapshot, SliceSnapshot } from '@blocksuite/store';

export function nanoidReplacement(snapshot: BlockSnapshot | SliceSnapshot) {
  return JSON.parse(nanoidReplacementString(JSON.stringify(snapshot)));
}
const escapedSnapshotAttributes = new Set([
  '"attributes"',
  '"conditions"',
  '"iconColumn"',
  '"background"',
  '"LinkedPage"',
  '"elementIds"',
  '"attachment"',
]);

function nanoidReplacementString(snapshotString: string) {
  const re =
    /("block:[A-Za-z0-9-_]{10}")|("[A-Za-z0-9-_]{10}")|("[A-Za-z0-9-_]{35}")|("[A-Za-z0-9-_]{10}:[A-Za-z0-9-_]{10}")|("var\(--affine-v2-chip-label-[a-z]{3,10}\)")|("[A-Za-z0-9-_=]{44}")/g;
  const matches = snapshotString.matchAll(re);
  const matchesReplaceMap = new Map();
  let escapedNumber = 0;
  Array.from(matches).forEach((match, index) => {
    if (escapedSnapshotAttributes.has(match[0])) {
      matchesReplaceMap.set(match[0], match[0]);
      escapedNumber++;
    } else {
      matchesReplaceMap.set(
        match[0],
        `"matchesReplaceMap[${index - escapedNumber}]"`
      );
    }
  });
  return snapshotString.replace(re, match => matchesReplaceMap.get(match));
}
