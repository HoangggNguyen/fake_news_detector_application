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

ALTER TABLE analyses
  ADD COLUMN conversation_id CHAR(36) NULL,
  ADD COLUMN turn_order BIGINT UNSIGNED NOT NULL AUTO_INCREMENT UNIQUE,
  ADD INDEX analyses_conversation_created (conversation_id, created_at),
  ADD CONSTRAINT analyses_conversation_fk FOREIGN KEY (conversation_id) REFERENCES conversations(id);

ALTER TABLE evidence
  MODIFY COLUMN source_type ENUM('fact_check', 'official', 'trusted_press', 'web_search', 'encyclopedia')
    NOT NULL DEFAULT 'web_search';
