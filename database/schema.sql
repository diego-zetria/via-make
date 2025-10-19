-- =====================================================
-- VSL Media Generation System - PostgreSQL Schema
-- =====================================================
-- Version: 1.0.0
-- Prefix: vsl-homolog
-- Date: 2025-10-18
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- ENUMS
-- =====================================================

CREATE TYPE media_type_enum AS ENUM ('video', 'image', 'audio');
CREATE TYPE job_status_enum AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- =====================================================
-- TABLE: jobs
-- Purpose: Main job tracking with full history
-- =====================================================

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id VARCHAR(255) UNIQUE NOT NULL,

    -- Media configuration
    media_type media_type_enum NOT NULL,
    model_id VARCHAR(100) NOT NULL,

    -- Status tracking
    status job_status_enum NOT NULL DEFAULT 'pending',
    replicate_id VARCHAR(255),

    -- Input parameters (flexible JSONB for any model)
    parameters JSONB NOT NULL DEFAULT '{}',
    prompt TEXT,

    -- User tracking
    user_id VARCHAR(255) NOT NULL,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,

    -- Metrics
    estimated_time INTEGER, -- seconds
    estimated_cost DECIMAL(10, 4),
    actual_processing_time INTEGER, -- seconds

    -- Error handling
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Indexes will be created separately
    CONSTRAINT jobs_check_status CHECK (
        (status = 'completed' AND completed_at IS NOT NULL) OR
        (status != 'completed')
    )
);

-- Add comments for documentation
COMMENT ON TABLE jobs IS 'Main table for tracking AI media generation jobs';
COMMENT ON COLUMN jobs.job_id IS 'Public-facing job identifier (UUID string)';
COMMENT ON COLUMN jobs.replicate_id IS 'Replicate API prediction ID for tracking';
COMMENT ON COLUMN jobs.parameters IS 'Flexible JSONB storage for any model-specific parameters';
COMMENT ON COLUMN jobs.metadata IS 'Additional metadata like IP address, user agent, etc.';

-- =====================================================
-- TABLE: media_outputs
-- Purpose: Store metadata about generated media files
-- =====================================================

CREATE TABLE media_outputs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

    -- S3 storage
    s3_key VARCHAR(500) NOT NULL,
    s3_url VARCHAR(1000) NOT NULL,
    s3_bucket VARCHAR(100) NOT NULL DEFAULT 'vsl-homolog-media',

    -- File information
    file_type VARCHAR(50), -- e.g., 'video/mp4', 'image/png', 'audio/mp3'
    file_size BIGINT, -- bytes

    -- Media-specific dimensions
    duration INTEGER, -- seconds (for video/audio)
    width INTEGER, -- pixels (for video/image)
    height INTEGER, -- pixels (for video/image)
    fps INTEGER, -- frames per second (for video)
    bitrate INTEGER, -- kbps (for video/audio)

    -- Additional outputs
    thumbnail_url VARCHAR(1000),
    preview_url VARCHAR(1000), -- e.g., GIF preview for video
    waveform_url VARCHAR(1000), -- for audio

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT media_outputs_check_duration CHECK (
        (media_type IN ('video', 'audio') AND duration > 0) OR
        (media_type = 'image')
    ),
    CONSTRAINT media_outputs_check_dimensions CHECK (
        (media_type IN ('video', 'image') AND width > 0 AND height > 0) OR
        (media_type = 'audio')
    )
);

-- Add generated column for media_type (derived from parent job)
ALTER TABLE media_outputs ADD COLUMN media_type media_type_enum;

COMMENT ON TABLE media_outputs IS 'Metadata for generated media files stored in S3';
COMMENT ON COLUMN media_outputs.s3_key IS 'S3 object key (path within bucket)';
COMMENT ON COLUMN media_outputs.metadata IS 'Additional metadata like color space, codec, etc.';

-- =====================================================
-- TABLE: model_configurations (Optional)
-- Purpose: Dynamic model registry for runtime configuration
-- =====================================================

CREATE TABLE model_configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id VARCHAR(100) UNIQUE NOT NULL,

    -- Model classification
    media_type media_type_enum NOT NULL,
    provider VARCHAR(50) NOT NULL DEFAULT 'replicate',

    -- Replicate-specific
    replicate_version VARCHAR(255) NOT NULL,
    replicate_owner VARCHAR(100),
    replicate_model VARCHAR(100),

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    is_beta BOOLEAN DEFAULT FALSE,

    -- Configuration (JSON schema for validation)
    configuration JSONB NOT NULL DEFAULT '{}',
    supported_parameters JSONB DEFAULT '[]',

    -- Pricing and performance
    pricing_per_unit DECIMAL(10, 4),
    estimated_time_seconds INTEGER,

    -- Metadata
    description TEXT,
    tags VARCHAR(50)[],

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Constraints
    CONSTRAINT model_config_check_pricing CHECK (pricing_per_unit >= 0)
);

COMMENT ON TABLE model_configurations IS 'Registry of available AI models for dynamic configuration';
COMMENT ON COLUMN model_configurations.configuration IS 'Model-specific configuration including defaults and limits';
COMMENT ON COLUMN model_configurations.supported_parameters IS 'Array of parameter names this model accepts';

-- =====================================================
-- TABLE: usage_tracking (Optional)
-- Purpose: Track usage for billing and analytics
-- =====================================================

CREATE TABLE usage_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,

    -- Cost tracking
    estimated_cost DECIMAL(10, 4),
    actual_cost DECIMAL(10, 4),

    -- Resource usage
    processing_time_seconds INTEGER,
    api_calls_count INTEGER DEFAULT 1,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    billing_period DATE GENERATED ALWAYS AS (DATE_TRUNC('month', created_at)::DATE) STORED
);

CREATE INDEX idx_usage_tracking_user_period ON usage_tracking(user_id, billing_period);

COMMENT ON TABLE usage_tracking IS 'Track usage metrics for billing and analytics';

-- =====================================================
-- INDEXES
-- =====================================================

-- Jobs table indexes
CREATE INDEX idx_jobs_user_id ON jobs(user_id);
CREATE INDEX idx_jobs_user_created ON jobs(user_id, created_at DESC);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_replicate_id ON jobs(replicate_id) WHERE replicate_id IS NOT NULL;
CREATE INDEX idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX idx_jobs_media_type ON jobs(media_type);
CREATE INDEX idx_jobs_model_id ON jobs(model_id);

-- Composite indexes for common queries
CREATE INDEX idx_jobs_user_status_created ON jobs(user_id, status, created_at DESC);
CREATE INDEX idx_jobs_status_created ON jobs(status, created_at DESC);

-- JSONB indexes for parameter queries
CREATE INDEX idx_jobs_parameters_gin ON jobs USING GIN (parameters);
CREATE INDEX idx_jobs_metadata_gin ON jobs USING GIN (metadata);

-- Media outputs indexes
CREATE INDEX idx_media_outputs_job_id ON media_outputs(job_id);
CREATE INDEX idx_media_outputs_created_at ON media_outputs(created_at DESC);

-- Model configurations indexes
CREATE INDEX idx_model_configs_media_type ON model_configurations(media_type);
CREATE INDEX idx_model_configs_active ON model_configurations(is_active) WHERE is_active = TRUE;

-- =====================================================
-- FUNCTIONS & TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to jobs table
CREATE TRIGGER trigger_jobs_updated_at
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to model_configurations table
CREATE TRIGGER trigger_model_configs_updated_at
    BEFORE UPDATE ON model_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function to validate job completion
CREATE OR REPLACE FUNCTION validate_job_completion()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
        NEW.completed_at = CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_jobs_completion
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION validate_job_completion();

-- =====================================================
-- VIEWS
-- =====================================================

-- View: Recent jobs with output information
CREATE OR REPLACE VIEW v_recent_jobs_with_outputs AS
SELECT
    j.id,
    j.job_id,
    j.media_type,
    j.model_id,
    j.status,
    j.user_id,
    j.created_at,
    j.completed_at,
    j.actual_processing_time,
    j.estimated_cost,
    mo.s3_url,
    mo.thumbnail_url,
    mo.file_size,
    mo.duration,
    mo.width,
    mo.height
FROM jobs j
LEFT JOIN media_outputs mo ON j.id = mo.job_id
ORDER BY j.created_at DESC;

COMMENT ON VIEW v_recent_jobs_with_outputs IS 'Convenient view combining jobs with their media outputs';

-- View: User statistics
CREATE OR REPLACE VIEW v_user_statistics AS
SELECT
    user_id,
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed') as failed_jobs,
    COUNT(*) FILTER (WHERE status = 'processing') as processing_jobs,
    SUM(actual_processing_time) FILTER (WHERE status = 'completed') as total_processing_time,
    AVG(actual_processing_time) FILTER (WHERE status = 'completed') as avg_processing_time,
    SUM(estimated_cost) as total_estimated_cost,
    MAX(created_at) as last_job_created
FROM jobs
GROUP BY user_id;

COMMENT ON VIEW v_user_statistics IS 'Aggregated statistics per user';

-- =====================================================
-- INITIAL DATA (Example models)
-- =====================================================

-- Insert example model configurations
INSERT INTO model_configurations (
    model_id, media_type, provider, replicate_version,
    replicate_owner, replicate_model,
    configuration, supported_parameters,
    pricing_per_unit, estimated_time_seconds,
    description, is_active
) VALUES
    (
        'flux-schnell',
        'image',
        'replicate',
        'black-forest-labs/flux-schnell',
        'black-forest-labs',
        'flux-schnell',
        '{"num_inference_steps": 4, "guidance_scale": 0}',
        '["prompt", "width", "height", "num_outputs"]',
        0.003,
        5,
        'Fast image generation with good quality',
        TRUE
    ),
    (
        'stable-video',
        'video',
        'replicate',
        'stability-ai/stable-video-diffusion',
        'stability-ai',
        'stable-video-diffusion',
        '{"motion_bucket_id": 127, "fps": 24, "num_frames": 25}',
        '["image", "motion_bucket_id", "fps", "num_frames"]',
        0.05,
        60,
        'Generate video from image using Stable Video Diffusion',
        TRUE
    ),
    (
        'musicgen',
        'audio',
        'replicate',
        'meta/musicgen',
        'meta',
        'musicgen',
        '{"duration": 8, "model_version": "stereo-large"}',
        '["prompt", "duration", "temperature", "top_k", "top_p"]',
        0.02,
        30,
        'Generate music from text prompts',
        TRUE
    )
ON CONFLICT (model_id) DO NOTHING;

-- =====================================================
-- GRANTS (Adjust based on your user setup)
-- =====================================================

-- Example: Grant permissions to application user
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO vsl_app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vsl_app_user;

-- =====================================================
-- MAINTENANCE
-- =====================================================

-- Vacuum and analyze tables for optimal performance
VACUUM ANALYZE jobs;
VACUUM ANALYZE media_outputs;
VACUUM ANALYZE model_configurations;
VACUUM ANALYZE usage_tracking;

-- =====================================================
-- SCHEMA VERSION TRACKING
-- =====================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version, description) VALUES
    ('1.0.0', 'Initial schema creation with jobs, media_outputs, and model_configurations')
ON CONFLICT (version) DO NOTHING;

-- =====================================================
-- END OF SCHEMA
-- =====================================================
