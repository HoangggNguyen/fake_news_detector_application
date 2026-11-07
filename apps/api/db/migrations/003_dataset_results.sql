CREATE TABLE IF NOT EXISTS dataset_results (
  analysis_id CHAR(36) PRIMARY KEY,
  result JSON NOT NULL,
  CONSTRAINT dataset_results_analysis_fk FOREIGN KEY (analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
);
