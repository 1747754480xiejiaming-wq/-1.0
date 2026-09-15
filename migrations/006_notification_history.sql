ALTER TABLE notifications ADD COLUMN deleted_at INTEGER;
CREATE INDEX idx_notifications_visible ON notifications(created_at DESC) WHERE deleted_at IS NULL;
INSERT INTO schema_migrations(version,applied_at) VALUES(6,unixepoch()*1000);
