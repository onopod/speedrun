CREATE TABLE IF NOT EXISTS speedrun_scores (
  id BIGSERIAL PRIMARY KEY,
  player_name VARCHAR(16) NOT NULL,
  time_ms INTEGER NOT NULL CHECK (time_ms BETWEEN 1000 AND 3600000),
  input_type VARCHAR(16) NOT NULL DEFAULT 'keyboard',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS speedrun_scores_time_idx
  ON speedrun_scores (time_ms ASC, created_at ASC);
