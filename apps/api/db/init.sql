CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY,
  input_type TEXT NOT NULL CHECK (input_type IN ('text', 'url')),
  input_text TEXT NOT NULL,
  url TEXT,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  overall_score REAL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  verdict TEXT NOT NULL,
  confidence REAL NOT NULL,
  reasoning TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY,
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  snippet TEXT NOT NULL,
  stance TEXT NOT NULL,
  source_domain TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS domains (
  domain TEXT PRIMARY KEY,
  reputation_score REAL,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY,
  analysis_id UUID NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
