CREATE TABLE teacher_task_timings(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  active_ms INTEGER NOT NULL CHECK(active_ms > 0 AND active_ms <= 28800000),
  elapsed_ms INTEGER NOT NULL CHECK(elapsed_ms > 0 AND elapsed_ms <= 28800000 AND active_ms <= elapsed_ms),
  completion_mode TEXT NOT NULL CHECK(completion_mode IN ('link','create','direct_reply')),
  client_started_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(owner_id,session_id)
);

CREATE INDEX idx_teacher_task_timings_owner_task_created ON teacher_task_timings(owner_id,task_id,created_at);
CREATE INDEX idx_teacher_task_timings_owner_created ON teacher_task_timings(owner_id,created_at);

INSERT INTO schema_migrations(version,applied_at) VALUES(22,unixepoch()*1000);
