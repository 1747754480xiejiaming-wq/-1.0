INSERT INTO runtime_preferences(key,value,updated_at)
SELECT 'qq_answer_enabled',coalesce((SELECT value FROM runtime_preferences WHERE key='qq_auto_start'),'true'),unixepoch()*1000
WHERE NOT EXISTS (SELECT 1 FROM runtime_preferences WHERE key='qq_answer_enabled');

INSERT INTO runtime_preferences(key,value,updated_at) VALUES('qq_auto_start','true',unixepoch()*1000)
ON CONFLICT(key) DO UPDATE SET value='true',updated_at=excluded.updated_at;

INSERT INTO schema_migrations(version,applied_at) VALUES(14,unixepoch()*1000);
