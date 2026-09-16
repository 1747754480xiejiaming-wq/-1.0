CREATE TABLE evaluation_runs(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  dataset_version TEXT NOT NULL,
  evidence_kind TEXT NOT NULL CHECK(evidence_kind IN ('teacher','synthetic')),
  knowledge_version TEXT NOT NULL,
  config_version TEXT NOT NULL,
  code_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed','awaiting_real_data')),
  summary_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE evaluation_results(
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sample_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  status TEXT NOT NULL,
  expected_json TEXT NOT NULL,
  actual_json TEXT NOT NULL,
  signature_json TEXT,
  divergence_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(run_id,sample_id,metric)
);

CREATE INDEX idx_evaluation_runs_owner_created ON evaluation_runs(owner_id,created_at);
CREATE INDEX idx_evaluation_results_run ON evaluation_results(run_id);

INSERT INTO schema_migrations(version,applied_at) VALUES(21,unixepoch()*1000);
