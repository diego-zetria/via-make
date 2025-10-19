-- =====================================================
-- VSL Media Generation System - PostgreSQL Schema
-- Fixed version for schema "replicate"
-- =====================================================

SET search_path TO replicate, public;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ENUMS
-- =====================================================

CREATE TYPE replicate.media_type_enum AS ENUM ('video', 'image', 'audio');
CREATE TYPE replicate.job_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- =====================================================
-- TABLE: jobs
-- =====================================================

CREATE TABLE replicate.jobs (
    id BIGSERIAL PRIMARY KEY,
    job_id VARCHAR(255) UNIQUE NOT NULL,

    -- Media configuration
    media_type replicate.media_type_enum NOT NULL,
    model_id VARCHAR(100) NOT NULL,

    -- Status tracking
    status replicate.job_status_enum NOT NULL DEFAULT 'pending',
    replicate_id VARCHAR(255),

    -- Input parameters
    parameters JSONB NOT NULL DEFAULT '{}',
    prompt TEXT,

    -- User tracking
    user_id VARCHAR(255) NOT NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Metrics
    estimated_time INTEGER,
    estimated_cost DECIMAL(10, 4),
    processing_time INTEGER,

    -- Storage
    s3_url VARCHAR(1000),
    s3_path VARCHAR(500),
    file_size BIGINT,

    -- Error handling
    error TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_jobs_job_id ON replicate.jobs(job_id);
CREATE INDEX idx_jobs_user_id ON replicate.jobs(user_id);
CREATE INDEX idx_jobs_status ON replicate.jobs(status);
CREATE INDEX idx_jobs_replicate_id ON replicate.jobs(replicate_id) WHERE replicate_id IS NOT NULL;
CREATE INDEX idx_jobs_created_at ON replicate.jobs(created_at DESC);
CREATE INDEX idx_jobs_user_status ON replicate.jobs(user_id, status, created_at DESC);
CREATE INDEX idx_jobs_parameters_gin ON replicate.jobs USING GIN (parameters);

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION replicate.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_jobs_updated_at
    BEFORE UPDATE ON replicate.jobs
    FOR EACH ROW
    EXECUTE FUNCTION replicate.update_updated_at_column();

-- =====================================================
-- SCHEMA VERSION
-- =====================================================

CREATE TABLE IF NOT EXISTS replicate.schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO replicate.schema_migrations (version, description) VALUES
    ('1.0.0', 'Initial VSL schema for replicate')
ON CONFLICT (version) DO NOTHING;
