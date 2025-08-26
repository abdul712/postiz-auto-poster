-- Create initial tables for Pinterest Auto-Poster

-- Table to track processed URLs from sitemap
CREATE TABLE processed_urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT UNIQUE NOT NULL,
  title TEXT,
  processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  pin_id TEXT,
  status TEXT CHECK(status IN ('pending', 'processed', 'scheduled', 'failed', 'skipped')) DEFAULT 'pending',
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- Index for efficient querying
CREATE INDEX idx_processed_urls_status ON processed_urls(status);
CREATE INDEX idx_processed_urls_processed_at ON processed_urls(processed_at);

-- Table to store generated pins and their metadata
CREATE TABLE generated_pins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_url TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  image_model TEXT, -- Track which AI model generated the image
  prompt_used TEXT, -- Store the prompt for future optimization
  postiz_id TEXT,
  scheduled_for DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT CHECK(status IN ('draft', 'scheduled', 'published', 'failed', 'cancelled')) DEFAULT 'draft',
  engagement_score INTEGER DEFAULT 0, -- Track performance for model optimization
  error_message TEXT
);

-- Indexes for efficient querying
CREATE INDEX idx_generated_pins_status ON generated_pins(status);
CREATE INDEX idx_generated_pins_scheduled_for ON generated_pins(scheduled_for);
CREATE INDEX idx_generated_pins_source_url ON generated_pins(source_url);
CREATE INDEX idx_generated_pins_image_model ON generated_pins(image_model);

-- Table to maintain sitemap processing state
CREATE TABLE sitemap_state (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sitemap_url TEXT UNIQUE NOT NULL,
  last_processed DATETIME,
  total_urls INTEGER DEFAULT 0,
  processed_urls INTEGER DEFAULT 0,
  failed_urls INTEGER DEFAULT 0,
  last_error TEXT,
  processing_status TEXT CHECK(processing_status IN ('idle', 'processing', 'error')) DEFAULT 'idle'
);

-- Table to track model performance for optimization
CREATE TABLE model_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  date DATE NOT NULL,
  total_generations INTEGER DEFAULT 0,
  successful_generations INTEGER DEFAULT 0,
  average_generation_time REAL DEFAULT 0,
  total_cost REAL DEFAULT 0,
  average_engagement REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(model_id, date)
);

-- Index for performance analytics
CREATE INDEX idx_model_performance_model_date ON model_performance(model_id, date);

-- Table to store successful prompts for reuse
CREATE TABLE prompt_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id TEXT NOT NULL,
  content_type TEXT NOT NULL, -- 'article', 'product', 'howto', etc.
  prompt_template TEXT NOT NULL,
  success_rate REAL DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Index for prompt lookup
CREATE INDEX idx_prompt_library_model_type ON prompt_library(model_id, content_type);