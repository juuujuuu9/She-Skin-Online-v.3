-- Migration: Add site_settings table
-- Created: 2026-02-21
-- Purpose: Store global site configuration like homepage video

CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups by key
CREATE INDEX idx_site_settings_key ON site_settings(key);
