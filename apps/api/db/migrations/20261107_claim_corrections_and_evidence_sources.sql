ALTER TABLE claims
  ADD COLUMN correction TEXT NULL;

ALTER TABLE evidence
  ADD COLUMN source_type ENUM('fact_check', 'official', 'web_search', 'encyclopedia')
    NOT NULL DEFAULT 'web_search';
