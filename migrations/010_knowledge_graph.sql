ALTER TABLE rag_documents ADD COLUMN graph_node_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rag_documents ADD COLUMN graph_edge_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE rag_graph_nodes(
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  node_key TEXT NOT NULL,
  label TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE(document_id,node_key)
);
CREATE INDEX idx_rag_graph_nodes_document ON rag_graph_nodes(document_id);

CREATE TABLE rag_graph_edges(
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES rag_graph_nodes(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES rag_graph_nodes(id) ON DELETE CASCADE,
  relation TEXT NOT NULL
);
CREATE INDEX idx_rag_graph_edges_document ON rag_graph_edges(document_id);

INSERT INTO schema_migrations(version,applied_at) VALUES(10,unixepoch()*1000);
