ALTER TABLE notification_targets ADD COLUMN claim_token TEXT;
ALTER TABLE notification_targets ADD COLUMN dispatch_started INTEGER NOT NULL DEFAULT 0;
UPDATE notification_targets SET status='failed',lease_until=NULL,last_error='升级前发送结果未确认，请核对群聊' WHERE status='processing';
INSERT INTO schema_migrations(version,applied_at) VALUES(3,CAST(strftime('%s','now') AS INTEGER)*1000);
