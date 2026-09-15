ALTER TABLE sessions ADD COLUMN developer_until INTEGER NOT NULL DEFAULT 0;

INSERT INTO schema_migrations(version,applied_at) VALUES(12,unixepoch()*1000);
