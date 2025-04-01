CREATE TABLE IF NOT EXISTS doc (
  workspace_id string indexed stored,
  doc_id string indexed stored,
  title text,
  summary string stored,
  journal string indexed stored,
  created_by_user_id string indexed stored,
  updated_by_user_id string indexed stored,
  created_at timestamp,
  updated_at timestamp
)
morphology = 'jieba_chinese, lemmatize_en_all, lemmatize_de_all, lemmatize_ru_all, libstemmer_ar, libstemmer_ca, stem_cz, libstemmer_da, libstemmer_nl, libstemmer_fi, libstemmer_fr, libstemmer_el, libstemmer_hi, libstemmer_hu, libstemmer_id, libstemmer_ga, libstemmer_it, libstemmer_lt, libstemmer_ne, libstemmer_no, libstemmer_pt, libstemmer_ro, libstemmer_es, libstemmer_sv, libstemmer_ta, libstemmer_tr'
charset_table = 'non_cjk, cjk'
index_field_lengths = '1'
