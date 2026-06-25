CREATE TABLE IF NOT EXISTS sounds (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    object_key TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL DEFAULT 'Sem categoria',
    tags TEXT NOT NULL DEFAULT '[]',
    favorite INTEGER NOT NULL DEFAULT 0,
    duration REAL NOT NULL DEFAULT 0,
    size INTEGER NOT NULL DEFAULT 0,
    mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',
    waveform TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sounds_category ON sounds(category);
CREATE INDEX IF NOT EXISTS idx_sounds_created ON sounds(created_at);
