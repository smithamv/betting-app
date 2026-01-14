-- Migration: add questions table with image columns

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  assessment_id UUID NOT NULL,
  position INT NOT NULL,
  question_text TEXT NOT NULL,
  question_image TEXT,
  option_a TEXT NOT NULL,
  option_a_image TEXT,
  option_b TEXT NOT NULL,
  option_b_image TEXT,
  option_c TEXT NOT NULL,
  option_c_image TEXT,
  option_d TEXT NOT NULL,
  option_d_image TEXT,
  correct_answer TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);
