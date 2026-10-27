import type { BlobSource, SourceBlobRecord } from '../../storage';

export interface BlobSourceCandidate {
  context: 'owned' | 'workspace';
  source: BlobSource;
  token: object;
}

export class BlobSourceRegistry {
  private readonly sourcesByKey = new Map<
    string,
    Map<string, BlobSourceCandidate>
  >();
  private readonly ownedEntries = new Map<
    string,
    { source: BlobSource; entries: SourceBlobRecord[]; token: object }
  >();
  private workspaceEntries: {
    entry: SourceBlobRecord;
    token: object;
  }[] = [];

  sourceId(source: BlobSource) {
    return source.type === 'currentDoc'
      ? `currentDoc\0${source.workspaceId}\0${source.docId}`
      : `history\0${source.workspaceId}\0${source.docId}\0${source.timestampMs}`;
  }

  candidates(key: string) {
    return [...(this.sourcesByKey.get(key)?.values() ?? [])];
  }

  hasCandidate(key: string, candidate: BlobSourceCandidate) {
    const found =
      this.sourcesByKey.get(key)?.get(this.candidateId(candidate))?.token ===
      candidate.token;
    return found;
  }

  replaceOwned(source: BlobSource, entries: SourceBlobRecord[], token: object) {
    const id = this.sourceId(source);
    this.ownedEntries.set(id, { source, entries, token });
    this.rebuild();
  }

  replaceWorkspace(entries: SourceBlobRecord[], token: object) {
    this.workspaceEntries = entries.map(entry => ({ entry, token }));
    this.rebuild();
  }

  removeKeyCandidate(key: string, candidate: BlobSourceCandidate) {
    const id = this.sourceId(candidate.source);
    if (candidate.context === 'workspace') {
      this.workspaceEntries = this.workspaceEntries.filter(
        workspace =>
          workspace.token !== candidate.token ||
          workspace.entry.key !== key ||
          this.sourceId(workspace.entry.source) !== id
      );
    } else {
      const owned = this.ownedEntries.get(id);
      if (owned?.token === candidate.token) {
        owned.entries = owned.entries.filter(entry => entry.key !== key);
      }
    }
    this.rebuild();
  }

  removeOwned(source: BlobSource) {
    const id = this.sourceId(source);
    this.ownedEntries.delete(id);
    this.rebuild();
  }

  private rebuild() {
    this.sourcesByKey.clear();
    for (const workspace of this.workspaceEntries) {
      this.merge(workspace.entry, 'workspace', workspace.token);
    }
    for (const registration of this.ownedEntries.values()) {
      for (const entry of registration.entries) {
        this.merge(entry, 'owned', registration.token);
      }
    }
  }

  private merge(
    entry: SourceBlobRecord,
    context: BlobSourceCandidate['context'],
    token: object
  ) {
    let sources = this.sourcesByKey.get(entry.key);
    if (!sources) {
      sources = new Map();
      this.sourcesByKey.set(entry.key, sources);
    }
    const candidate = { context, source: entry.source, token };
    sources.set(this.candidateId(candidate), candidate);
  }

  private candidateId(candidate: BlobSourceCandidate) {
    return `${candidate.context}\0${this.sourceId(candidate.source)}`;
  }
}
