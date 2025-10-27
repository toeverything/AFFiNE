import type {
  BaseTextAttributes,
  BlockSnapshot,
  DeltaInsert,
} from '@blocksuite/affine/store';

const MentionAttribute = 'mention';
type ExtendedTextAttributes = BaseTextAttributes & {
  [MentionAttribute]: {
    member: string;
  };
};

export function findMentions(snapshot: BlockSnapshot): string[] {
  const mentionedUserIds = new Set<string>();
  if (
    snapshot.props.type === 'text' &&
    snapshot.props.text &&
    'delta' in (snapshot.props.text as any)
  ) {
    const delta = (snapshot.props.text as any)
      .delta as DeltaInsert<ExtendedTextAttributes>[];
    for (const op of delta) {
      if (op.attributes?.[MentionAttribute]) {
        mentionedUserIds.add(op.attributes[MentionAttribute].member);
      }
    }
  }

  for (const block of snapshot.children) {
    findMentions(block).forEach(userId => {
      mentionedUserIds.add(userId);
    });
  }

  return Array.from(mentionedUserIds);
}
