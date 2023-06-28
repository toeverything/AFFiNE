// fixme: vector store has not finished
import type { DBSchema } from 'idb';
import { Document } from 'langchain/document';
import type { Embeddings } from 'langchain/embeddings';
import { VectorStore } from 'langchain/vectorstores';
import { similarity as ml_distance_similarity } from 'ml-distance';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface VectorDBV1 extends DBSchema {
  vector: {
    key: string;
    value: Vector;
  };
}

interface Vector {
  id: string;

  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
}

export interface MemoryVectorStoreArgs {
  similarity?: typeof ml_distance_similarity.cosine;
}

export class IndexedDBVectorStore extends VectorStore {
  memoryVectors: any[] = [];

  similarity: typeof ml_distance_similarity.cosine;

  constructor(
    embeddings: Embeddings,
    { similarity, ...rest }: MemoryVectorStoreArgs = {}
  ) {
    super(embeddings, rest);

    this.similarity = similarity ?? ml_distance_similarity.cosine;
  }

  async addDocuments(documents: Document[]): Promise<void> {
    const texts = documents.map(({ pageContent }) => pageContent);
    return this.addVectors(
      await this.embeddings.embedDocuments(texts),
      documents
    );
  }

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    const memoryVectors = vectors.map((embedding, idx) => ({
      content: documents[idx].pageContent,
      embedding,
      metadata: documents[idx].metadata,
    }));

    this.memoryVectors = this.memoryVectors.concat(memoryVectors);
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number
  ): Promise<[Document, number][]> {
    const searches = this.memoryVectors
      .map((vector, index) => ({
        similarity: this.similarity(query, vector.embedding),
        index,
      }))
      .sort((a, b) => (a.similarity > b.similarity ? -1 : 0))
      .slice(0, k);

    const result: [Document, number][] = searches.map(search => [
      new Document({
        metadata: this.memoryVectors[search.index].metadata,
        pageContent: this.memoryVectors[search.index].content,
      }),
      search.similarity,
    ]);

    return result;
  }

  static override async fromTexts(
    texts: string[],
    metadatas: object[] | object,
    embeddings: Embeddings,
    dbConfig?: MemoryVectorStoreArgs
  ): Promise<IndexedDBVectorStore> {
    const docs: Document[] = [];
    for (let i = 0; i < texts.length; i += 1) {
      const metadata = Array.isArray(metadatas) ? metadatas[i] : metadatas;
      const newDoc = new Document({
        pageContent: texts[i],
        metadata,
      });
      docs.push(newDoc);
    }
    return IndexedDBVectorStore.fromDocuments(docs, embeddings, dbConfig);
  }

  static override async fromDocuments(
    docs: Document[],
    embeddings: Embeddings,
    dbConfig?: MemoryVectorStoreArgs
  ): Promise<IndexedDBVectorStore> {
    const instance = new this(embeddings, dbConfig);
    await instance.addDocuments(docs);
    return instance;
  }

  static async fromExistingIndex(
    embeddings: Embeddings,
    dbConfig?: MemoryVectorStoreArgs
  ): Promise<IndexedDBVectorStore> {
    const instance = new this(embeddings, dbConfig);
    return instance;
  }
}
