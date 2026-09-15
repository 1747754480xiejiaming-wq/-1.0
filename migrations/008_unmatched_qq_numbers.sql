ALTER TABLE unmatched_qq_students ADD COLUMN qq_number TEXT;
ALTER TABLE unmatched_qq_students ADD COLUMN confirmed_name TEXT;
INSERT INTO schema_migrations(version,applied_at) VALUES(8,unixepoch()*1000);
