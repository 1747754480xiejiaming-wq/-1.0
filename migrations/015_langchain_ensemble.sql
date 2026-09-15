UPDATE rag_settings
SET rerank_model='langchain/ensemble-rrf', updated_at=unixepoch()*1000
WHERE rerank_model IN ('local/rrf','local/mmr');

INSERT INTO schema_migrations(version,applied_at) VALUES(15,unixepoch()*1000);
