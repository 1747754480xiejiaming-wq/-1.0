ALTER TABLE notification_targets ADD COLUMN platform_message_id TEXT;
INSERT INTO schema_migrations(version,applied_at) VALUES(4,CAST(strftime('%s','now') AS INTEGER)*1000);
