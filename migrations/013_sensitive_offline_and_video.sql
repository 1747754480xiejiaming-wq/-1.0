ALTER TABLE unmatched_questions ADD COLUMN queue_type TEXT NOT NULL DEFAULT 'manual'
  CHECK(queue_type IN ('manual','unrelated','offline'));

CREATE INDEX idx_unmatched_queue_type ON unmatched_questions(queue_type,status,last_seen DESC);

CREATE TABLE runtime_preferences(
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO runtime_preferences(key,value,updated_at) VALUES
  ('offline_auto_reply','true',unixepoch()*1000),
  ('qq_auto_start','true',unixepoch()*1000),
  ('deepseek_auto_start','true',unixepoch()*1000);

ALTER TABLE faq_attachments RENAME TO faq_attachments_legacy;
CREATE TABLE faq_attachments(
  id TEXT PRIMARY KEY,
  faq_id TEXT NOT NULL REFERENCES faqs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('folder','image','pdf','word','excel','video')),
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
INSERT INTO faq_attachments(id,faq_id,name,stored_name,kind,mime,size,created_at)
  SELECT id,faq_id,name,stored_name,kind,mime,size,created_at FROM faq_attachments_legacy;
DROP TABLE faq_attachments_legacy;
CREATE INDEX idx_faq_attachments_faq ON faq_attachments(faq_id,created_at);

INSERT INTO schema_migrations(version,applied_at) VALUES(13,unixepoch()*1000);
