CREATE TABLE conversation_sessions(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('web','qq')),
  target_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('active','completed','expired')),
  round INTEGER NOT NULL DEFAULT 0 CHECK(round BETWEEN 0 AND 2),
  original_question TEXT NOT NULL,
  knowledge_version TEXT NOT NULL,
  config_version TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE conversation_messages(
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  text TEXT NOT NULL,
  intent TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(conversation_id,request_id,direction)
);

CREATE TABLE conversation_slots(
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  slot_key TEXT NOT NULL,
  value TEXT,
  source_message_id TEXT,
  confidence INTEGER NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 100),
  asked INTEGER NOT NULL DEFAULT 0 CHECK(asked IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(conversation_id,slot_key)
);

CREATE INDEX idx_conversation_sessions_scope ON conversation_sessions(owner_id,channel,target_id,sender_id,status,updated_at);
CREATE INDEX idx_conversation_messages_conversation ON conversation_messages(conversation_id,created_at);
CREATE INDEX idx_conversation_slots_conversation ON conversation_slots(conversation_id,slot_key);

INSERT INTO schema_migrations(version,applied_at) VALUES(20,unixepoch()*1000);
