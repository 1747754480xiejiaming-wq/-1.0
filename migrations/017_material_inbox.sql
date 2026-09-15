CREATE TABLE material_categories(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id,name)
);

CREATE TABLE material_items(
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  category_id TEXT REFERENCES material_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending_confirm','pending_archive','archived')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(owner_id,source_key)
);

CREATE INDEX idx_material_categories_owner ON material_categories(owner_id,name);
CREATE INDEX idx_material_items_owner ON material_items(owner_id,status,created_at DESC);

INSERT INTO schema_migrations(version,applied_at) VALUES(17,unixepoch()*1000);
