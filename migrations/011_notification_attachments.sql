ALTER TABLE qq_groups ADD COLUMN deleted_at INTEGER;
CREATE INDEX idx_qq_groups_visible ON qq_groups(enabled,last_seen DESC) WHERE deleted_at IS NULL;

CREATE TABLE notification_attachments (
 id TEXT PRIMARY KEY,
 notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 name TEXT NOT NULL,
 stored_name TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL CHECK(kind IN ('folder','image','pdf','word','excel','video')),
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX idx_notification_attachments_notice ON notification_attachments(notification_id,created_at);

INSERT INTO schema_migrations(version,applied_at) VALUES(11,unixepoch()*1000);
