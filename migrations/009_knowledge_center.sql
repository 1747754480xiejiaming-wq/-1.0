ALTER TABLE faqs ADD COLUMN library_type TEXT NOT NULL DEFAULT 'answer' CHECK(library_type IN ('answer','forbidden'));

CREATE TABLE knowledge_categories(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  library_type TEXT NOT NULL CHECK(library_type IN ('answer','forbidden')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(name,library_type)
);

INSERT INTO knowledge_categories(id,name,library_type,sort_order,created_at,updated_at) VALUES
 ('cat-answer-course','选课与课程','answer',10,unixepoch()*1000,unixepoch()*1000),
 ('cat-answer-exam','考试与成绩','answer',20,unixepoch()*1000,unixepoch()*1000),
 ('cat-answer-status','学籍与注册','answer',30,unixepoch()*1000,unixepoch()*1000),
 ('cat-answer-graduate','毕业与材料','answer',40,unixepoch()*1000,unixepoch()*1000),
 ('cat-answer-service','校园服务','answer',50,unixepoch()*1000,unixepoch()*1000),
 ('cat-forbidden-policy','政策红线','forbidden',10,unixepoch()*1000,unixepoch()*1000),
 ('cat-forbidden-safety','安全与隐私','forbidden',20,unixepoch()*1000,unixepoch()*1000),
 ('cat-forbidden-content','违规内容','forbidden',30,unixepoch()*1000,unixepoch()*1000);

CREATE TABLE faq_attachments(
  id TEXT PRIMARY KEY,
  faq_id TEXT NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('folder','image','pdf','word','excel')),
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_faq_attachments_faq ON faq_attachments(faq_id,created_at);

CREATE TABLE rag_folders(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES rag_folders(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE rag_documents(
  id TEXT PRIMARY KEY,
  folder_id TEXT REFERENCES rag_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','parsing','ready','failed')),
  progress INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  token_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_rag_documents_folder ON rag_documents(folder_id,updated_at);
CREATE TABLE rag_chunks(
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL,
  keywords_json TEXT NOT NULL,
  embedding_json TEXT NOT NULL,
  UNIQUE(document_id,position)
);
CREATE INDEX idx_rag_chunks_document ON rag_chunks(document_id,position);
CREATE TABLE rag_settings(
  id INTEGER PRIMARY KEY CHECK(id=1),
  embedding_model TEXT NOT NULL,
  rerank_model TEXT NOT NULL,
  parser_mode TEXT NOT NULL CHECK(parser_mode IN ('local','model')),
  chunk_size INTEGER NOT NULL,
  chunk_overlap INTEGER NOT NULL,
  top_k INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO rag_settings VALUES(1,'local/hash-384','local/rrf','local',700,100,5,unixepoch()*1000);
CREATE TABLE rag_eval_runs(
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO schema_migrations(version,applied_at) VALUES(9,unixepoch()*1000);
