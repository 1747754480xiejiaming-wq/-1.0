CREATE TABLE unmatched_qq_students (
 question_id TEXT NOT NULL REFERENCES unmatched_questions(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL,
 sender_name TEXT,
 question_count INTEGER NOT NULL DEFAULT 1,
 first_seen INTEGER NOT NULL,
 last_seen INTEGER NOT NULL,
 PRIMARY KEY(question_id,sender_id)
);
CREATE INDEX idx_unmatched_qq_students_question ON unmatched_qq_students(question_id,last_seen DESC);
INSERT INTO schema_migrations(version,applied_at) VALUES(7,unixepoch()*1000);
