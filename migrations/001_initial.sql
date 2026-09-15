PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS faqs (
 id TEXT PRIMARY KEY, question TEXT NOT NULL, question_key TEXT NOT NULL UNIQUE, answer TEXT NOT NULL,
 keywords TEXT NOT NULL, category TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','disabled')),
 version INTEGER NOT NULL DEFAULT 1, is_demo INTEGER NOT NULL DEFAULT 0, updated_by TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_faq_status ON faqs(status,category);
CREATE TABLE IF NOT EXISTS admin_users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES admin_users(id), csrf_token TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS unmatched_questions (
 id TEXT PRIMARY KEY, question_key TEXT NOT NULL UNIQUE, question TEXT NOT NULL, reason TEXT NOT NULL,
 web_count INTEGER NOT NULL DEFAULT 0, qq_count INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','ignored')),
 resolved_faq_id TEXT REFERENCES faqs(id), first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_unmatched_status ON unmatched_questions(status,last_seen);
CREATE TABLE IF NOT EXISTS question_daily (day TEXT NOT NULL, channel TEXT NOT NULL, metric_key TEXT NOT NULL, hits INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(day,channel,metric_key));
CREATE TABLE IF NOT EXISTS request_dedup (key_hash TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, state TEXT NOT NULL, response_json TEXT, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS admin_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL, action TEXT NOT NULL, faq_id TEXT, version INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS model_usage (day TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(1,CAST(strftime('%s','now') AS INTEGER)*1000);
