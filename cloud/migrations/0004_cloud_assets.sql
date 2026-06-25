CREATE TABLE IF NOT EXISTS cloud_assets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    collection TEXT NOT NULL DEFAULT 'Geral',
    kind TEXT NOT NULL DEFAULT 'arquivo',
    tags TEXT NOT NULL DEFAULT '[]',
    favorite INTEGER NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cloud_assets_collection ON cloud_assets(collection);
CREATE INDEX IF NOT EXISTS idx_cloud_assets_kind ON cloud_assets(kind);
CREATE INDEX IF NOT EXISTS idx_cloud_assets_created ON cloud_assets(created_at);
