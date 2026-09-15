CREATE TABLE IF NOT EXISTS qq_groups (
 id TEXT PRIMARY KEY,
 open_id TEXT NOT NULL UNIQUE,
 label TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 first_seen INTEGER NOT NULL,
 last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_qq_groups_enabled ON qq_groups(enabled,last_seen DESC);

CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY,
 request_id TEXT NOT NULL UNIQUE,
 payload_hash TEXT NOT NULL,
 title TEXT NOT NULL,
 content TEXT NOT NULL,
 created_by TEXT NOT NULL,
 created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_targets (
 id TEXT PRIMARY KEY,
 notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 group_id TEXT NOT NULL REFERENCES qq_groups(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','sent','failed')),
 attempt_count INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER,
 sent_at INTEGER,
 last_error TEXT,
 UNIQUE(notification_id,group_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_targets_queue ON notification_targets(status,lease_until);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

INSERT OR IGNORE INTO schema_migrations(version,applied_at) VALUES(2,CAST(strftime('%s','now') AS INTEGER)*1000);
