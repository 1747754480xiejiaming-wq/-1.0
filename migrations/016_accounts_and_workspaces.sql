ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'teacher' CHECK(role IN ('teacher','developer'));
ALTER TABLE admin_users ADD COLUMN workspace_id TEXT;
UPDATE admin_users SET workspace_id='legacy' WHERE role='teacher' AND workspace_id IS NULL;

ALTER TABLE faqs ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
UPDATE faqs SET question_key=owner_id || ':' || question_key;
CREATE INDEX idx_faq_owner_status ON faqs(owner_id,library_type,status,category);

ALTER TABLE unmatched_questions ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
UPDATE unmatched_questions SET question_key=owner_id || ':' || question_key;
CREATE INDEX idx_unmatched_owner ON unmatched_questions(owner_id,queue_type,status,last_seen DESC);

ALTER TABLE rag_folders ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE rag_documents ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX idx_rag_folders_owner ON rag_folders(owner_id,name);
CREATE INDEX idx_rag_documents_owner ON rag_documents(owner_id,updated_at DESC);

ALTER TABLE qq_groups ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE notifications ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX idx_qq_groups_owner ON qq_groups(owner_id,enabled,last_seen DESC);
CREATE INDEX idx_notifications_owner ON notifications(owner_id,created_at DESC);

ALTER TABLE admin_audit ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';

ALTER TABLE question_daily RENAME TO question_daily_legacy;
CREATE TABLE question_daily(
  owner_id TEXT NOT NULL,
  day TEXT NOT NULL,
  channel TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(owner_id,day,channel,metric_key)
);
INSERT INTO question_daily(owner_id,day,channel,metric_key,hits)
  SELECT 'legacy',day,channel,metric_key,hits FROM question_daily_legacy;
DROP TABLE question_daily_legacy;

ALTER TABLE model_usage RENAME TO model_usage_legacy;
CREATE TABLE model_usage(
  owner_id TEXT NOT NULL,
  day TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(owner_id,day)
);
INSERT INTO model_usage(owner_id,day,attempts,errors,input_tokens,output_tokens)
  SELECT 'legacy',day,attempts,errors,input_tokens,output_tokens FROM model_usage_legacy;
DROP TABLE model_usage_legacy;

ALTER TABLE knowledge_categories RENAME TO knowledge_categories_legacy;
CREATE TABLE knowledge_categories(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  library_type TEXT NOT NULL CHECK(library_type IN ('answer','forbidden')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id,name,library_type)
);
INSERT INTO knowledge_categories(id,owner_id,name,library_type,sort_order,created_at,updated_at)
  SELECT id,'legacy',name,library_type,sort_order,created_at,updated_at FROM knowledge_categories_legacy;
DROP TABLE knowledge_categories_legacy;
CREATE INDEX idx_knowledge_categories_owner ON knowledge_categories(owner_id,library_type,sort_order,name);

ALTER TABLE rag_settings RENAME TO rag_settings_legacy;
CREATE TABLE rag_settings(
  owner_id TEXT PRIMARY KEY,
  embedding_model TEXT NOT NULL,
  rerank_model TEXT NOT NULL,
  parser_mode TEXT NOT NULL CHECK(parser_mode IN ('local','model')),
  chunk_size INTEGER NOT NULL,
  chunk_overlap INTEGER NOT NULL,
  top_k INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO rag_settings(owner_id,embedding_model,rerank_model,parser_mode,chunk_size,chunk_overlap,top_k,updated_at)
  SELECT 'legacy',embedding_model,rerank_model,parser_mode,chunk_size,chunk_overlap,top_k,updated_at FROM rag_settings_legacy WHERE id=1;
DROP TABLE rag_settings_legacy;

ALTER TABLE runtime_preferences RENAME TO runtime_preferences_legacy;
CREATE TABLE runtime_preferences(
  owner_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,key)
);
INSERT INTO runtime_preferences(owner_id,key,value,updated_at)
  SELECT 'legacy',key,value,updated_at FROM runtime_preferences_legacy;
DROP TABLE runtime_preferences_legacy;

INSERT INTO schema_migrations(version,applied_at) VALUES(16,unixepoch()*1000);
