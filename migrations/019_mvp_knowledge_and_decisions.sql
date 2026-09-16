CREATE TABLE knowledge_versions(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  created_by TEXT,
  UNIQUE(owner_id,content_hash)
);

CREATE TABLE answer_decision_traces(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  input_fingerprint TEXT NOT NULL,
  disposition TEXT NOT NULL CHECK(disposition IN ('answer','clarify','escalate')),
  faq_id TEXT,
  knowledge_version TEXT NOT NULL,
  config_version TEXT NOT NULL,
  key_facts_json TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(owner_id,request_id)
);

CREATE INDEX idx_answer_decision_traces_owner_created ON answer_decision_traces(owner_id,created_at);
CREATE INDEX idx_answer_decision_traces_owner_fingerprint ON answer_decision_traces(owner_id,input_fingerprint);

INSERT INTO schema_migrations(version,applied_at) VALUES(19,unixepoch()*1000);
