ALTER TABLE qq_groups ADD COLUMN bot_app_id TEXT NOT NULL DEFAULT '';
ALTER TABLE qq_groups ADD COLUMN actual_name TEXT;
ALTER TABLE qq_groups ADD COLUMN group_number TEXT;
ALTER TABLE qq_groups ADD COLUMN metadata_synced_at INTEGER;
UPDATE qq_groups SET label='待核对群名' WHERE label='学生工作群 · ' || substr(open_id,-6);
INSERT INTO schema_migrations(version,applied_at) VALUES(5,unixepoch()*1000);
