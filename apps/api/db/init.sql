CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(80) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX login_sessions_user (user_id),
  CONSTRAINT login_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(180) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX conversations_user_updated (user_id, updated_at),
  CONSTRAINT conversations_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analyses (
  id CHAR(36) PRIMARY KEY,
  session_id VARCHAR(128) NOT NULL,
  conversation_id CHAR(36),
  turn_order BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  input_type ENUM('text', 'url') NOT NULL,
  input_text MEDIUMTEXT NOT NULL,
  url TEXT,
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  error_message VARCHAR(500),
  overall_score FLOAT,
  label VARCHAR(40),
  overall_summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX analyses_session_created (session_id, created_at),
  INDEX analyses_conversation_created (conversation_id, created_at),
  CONSTRAINT analyses_conversation_fk FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS claims (
  id CHAR(36) PRIMARY KEY,
  analysis_id CHAR(36) NOT NULL,
  text TEXT NOT NULL,
  verdict ENUM('supported', 'refuted', 'mixed', 'unverifiable') NOT NULL,
  confidence FLOAT NOT NULL,
  reasoning TEXT NOT NULL,
  correction TEXT,
  CONSTRAINT claims_analysis_fk FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS classifier_signals (
  analysis_id CHAR(36) PRIMARY KEY,
  label ENUM('real', 'fake') NOT NULL,
  confidence FLOAT NOT NULL,
  real_probability FLOAT NOT NULL,
  fake_probability FLOAT NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  model_version VARCHAR(40) NOT NULL,
  top_features JSON NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT classifier_signals_analysis_fk FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dataset_results (
  analysis_id CHAR(36) PRIMARY KEY,
  result JSON NOT NULL,
  CONSTRAINT dataset_results_analysis_fk FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evidence (
  id CHAR(36) PRIMARY KEY,
  claim_id CHAR(36) NOT NULL,
  title TEXT NOT NULL,
  url VARCHAR(2048) NOT NULL,
  snippet TEXT NOT NULL,
  stance ENUM('supports', 'refutes', 'context') NOT NULL,
  source_domain VARCHAR(255) NOT NULL,
  source_type ENUM('fact_check', 'official', 'trusted_press', 'web_search', 'encyclopedia') NOT NULL DEFAULT 'web_search',
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
