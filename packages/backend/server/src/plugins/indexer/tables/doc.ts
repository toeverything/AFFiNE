import { z } from 'zod';

export const DocSchema = z.object({
  workspace_id: z.string(),
  doc_id: z.string(),
  title: z.string(),
  summary: z.string(),
  journal: z.string().optional(),
  created_by_user_id: z.string(),
  updated_by_user_id: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type Doc = z.input<typeof DocSchema>;

export function getDocUniqueId(doc: Doc) {
  return `${doc.workspace_id}/${doc.doc_id}`;
}

export const docMapping = {
  settings: {
    analysis: {
      analyzer: {
        standard_with_cjk: {
          tokenizer: 'standard',
          filter: [
            'lowercase',
            'cjk_bigram_and_unigrams',
            'keyword_repeat',
            'stemmer',
            'remove_duplicates',
          ],
        },
        autocomplete: {
          tokenizer: 'autocomplete_tokenizer',
          filter: ['lowercase'],
        },
      },
      tokenizer: {
        autocomplete_tokenizer: {
          type: 'edge_ngram',
          min_gram: 1,
          max_gram: 20,
          token_chars: ['letter', 'digit', 'punctuation', 'symbol'],
        },
      },
      filter: {
        cjk_bigram_and_unigrams: {
          type: 'cjk_bigram',
          output_unigrams: true,
        },
      },
    },
  },
  mappings: {
    properties: {
      workspace_id: {
        type: 'keyword',
      },
      doc_id: {
        type: 'keyword',
      },
      title: {
        type: 'text',
        analyzer: 'standard_with_cjk',
        search_analyzer: 'standard_with_cjk',
        fields: {
          autocomplete: {
            type: 'text',
            analyzer: 'autocomplete',
            search_analyzer: 'standard',
          },
        },
      },
      summary: {
        type: 'text',
        index: false,
      },
      journal: {
        type: 'keyword',
      },
      created_by_user_id: {
        type: 'keyword',
      },
      updated_by_user_id: {
        type: 'keyword',
      },
      created_at: {
        type: 'date',
      },
      updated_at: {
        type: 'date',
      },
    },
  },
};

export const docSQL = `
CREATE TABLE IF NOT EXISTS doc (
  workspace_id string attribute,
  doc_id string attribute,
  title text,
  summary string stored,
  journal string stored,
  created_by_user_id string attribute,
  updated_by_user_id string attribute,
  created_at timestamp,
  updated_at timestamp
)
morphology = 'jieba_chinese, lemmatize_en_all, lemmatize_de_all, lemmatize_ru_all, libstemmer_ar, libstemmer_ca, stem_cz, libstemmer_da, libstemmer_nl, libstemmer_fi, libstemmer_fr, libstemmer_el, libstemmer_hi, libstemmer_hu, libstemmer_id, libstemmer_ga, libstemmer_it, libstemmer_lt, libstemmer_ne, libstemmer_no, libstemmer_pt, libstemmer_ro, libstemmer_es, libstemmer_sv, libstemmer_ta, libstemmer_tr'
charset_table = 'non_cjk, cjk'
index_field_lengths = '1'
`;
