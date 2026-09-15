ALTER TABLE unmatched_qq_students ADD COLUMN chat_kind TEXT CHECK(chat_kind IN ('c2c','group'));
ALTER TABLE unmatched_qq_students ADD COLUMN target_id TEXT;
ALTER TABLE unmatched_qq_students ADD COLUMN message_id TEXT;

CREATE TABLE unmatched_reply_targets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES unmatched_questions(id) ON DELETE CASCADE,
  faq_id TEXT,
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  chat_kind TEXT NOT NULL CHECK(chat_kind IN ('c2c','group')),
  target_id TEXT NOT NULL,
  answer TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  claim_token TEXT,
  dispatch_started INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER,
  sent_at INTEGER,
  last_error TEXT,
  platform_message_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(question_id,sender_id)
);
CREATE INDEX idx_unmatched_reply_pending ON unmatched_reply_targets(owner_id,status,created_at);

-- The desktop build that introduced this queue may be installed after a teacher
-- has already resolved earlier QQ questions. Backfill every still-linked answer
-- once so those students also receive the teacher's final response. Older rows
-- did not retain chat scope, so their sender OpenID is treated as C2C and sent
-- through QQ's 30-day wakeup API.
INSERT OR IGNORE INTO unmatched_reply_targets(
  id,owner_id,question_id,faq_id,sender_id,sender_name,chat_kind,target_id,
  answer,status,created_at,updated_at
)
SELECT lower(hex(randomblob(16))),u.owner_id,u.id,f.id,s.sender_id,
  coalesce(s.confirmed_name,s.sender_name),'c2c',s.sender_id,
  f.answer,'pending',u.last_seen,unixepoch()*1000
FROM unmatched_questions u
JOIN unmatched_qq_students s ON s.question_id=u.id
JOIN faqs f ON f.id=u.resolved_faq_id AND f.owner_id=u.owner_id
WHERE u.status='resolved' AND u.queue_type='manual';

INSERT INTO schema_migrations(version,applied_at) VALUES(18,unixepoch()*1000);
