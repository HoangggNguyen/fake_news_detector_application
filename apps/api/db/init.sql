CREATE TABLE IF NOT EXISTS analyses (
  id CHAR(36) PRIMARY KEY,
  session_id VARCHAR(128) NOT NULL,
  input_type ENUM('text', 'url') NOT NULL,
  input_text MEDIUMTEXT NOT NULL,
  url TEXT,
  content_hash CHAR(64) NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  overall_score FLOAT,
  label VARCHAR(40),
  overall_summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX analyses_session_created (session_id, created_at),
  INDEX analyses_content_hash (content_hash)
);

CREATE TABLE IF NOT EXISTS claims (
  id CHAR(36) PRIMARY KEY,
  analysis_id CHAR(36) NOT NULL,
  text TEXT NOT NULL,
  verdict ENUM('supported', 'refuted', 'mixed', 'unverifiable') NOT NULL,
  confidence FLOAT NOT NULL,
  reasoning TEXT NOT NULL,
  CONSTRAINT claims_analysis_fk FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence (
  id CHAR(36) PRIMARY KEY,
  claim_id CHAR(36) NOT NULL,
  title TEXT NOT NULL,
  url VARCHAR(2048) NOT NULL,
  snippet TEXT NOT NULL,
  stance ENUM('supports', 'refutes', 'context') NOT NULL,
  source_domain VARCHAR(255) NOT NULL,
  CONSTRAINT evidence_claim_fk FOREIGN KEY (claim_id) REFERENCES claims(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS domains (
  domain VARCHAR(255) PRIMARY KEY,
  reputation_score FLOAT,
  notes TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback (
  id CHAR(36) PRIMARY KEY,
  analysis_id CHAR(36) NOT NULL,
  rating TINYINT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT feedback_analysis_fk FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
