# VSL Database Setup

## Overview
PostgreSQL database schema for the VSL media generation system.

## Quick Start

### 1. Connect to your PostgreSQL instance
```bash
psql -h your-rds-endpoint.amazonaws.com -U your-username -d your-database
```

### 2. Execute the schema
```bash
psql -h your-rds-endpoint.amazonaws.com -U your-username -d your-database -f database/schema.sql
```

## Database Structure

### Core Tables

#### `jobs`
Main table for tracking AI media generation jobs.
- **Primary Key**: `id` (UUID)
- **Unique Key**: `job_id` (public-facing identifier)
- **Indexes**: user_id, status, replicate_id, created_at
- **Features**: JSONB for flexible parameters, automatic timestamp updates

#### `media_outputs`
Stores metadata about generated media files in S3.
- **Primary Key**: `id` (UUID)
- **Foreign Key**: `job_id` → jobs(id)
- **Features**: Comprehensive media metadata (dimensions, duration, file size)

#### `model_configurations`
Registry of available AI models for dynamic configuration.
- **Primary Key**: `id` (UUID)
- **Unique Key**: `model_id`
- **Features**: JSONB configuration, pricing, performance metrics

#### `usage_tracking` (Optional)
Track usage for billing and analytics.
- **Primary Key**: `id` (UUID)
- **Foreign Key**: `job_id` → jobs(id)
- **Features**: Cost tracking, billing periods

### Views

#### `v_recent_jobs_with_outputs`
Convenient view combining jobs with their media outputs.

#### `v_user_statistics`
Aggregated statistics per user (total jobs, completion rate, costs).

## Sample Queries

### Get user's recent jobs with status
```sql
SELECT job_id, media_type, model_id, status, created_at
FROM jobs
WHERE user_id = 'user123'
ORDER BY created_at DESC
LIMIT 10;
```

### Check processing statistics by model
```sql
SELECT
    model_id,
    COUNT(*) as total_jobs,
    AVG(actual_processing_time) as avg_time_seconds,
    SUM(estimated_cost) as total_cost
FROM jobs
WHERE status = 'completed'
GROUP BY model_id;
```

### Find jobs pending for too long
```sql
SELECT job_id, user_id, created_at,
       EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at)) as age_seconds
FROM jobs
WHERE status = 'processing'
  AND created_at < CURRENT_TIMESTAMP - INTERVAL '1 hour'
ORDER BY created_at;
```

### Get user statistics
```sql
SELECT * FROM v_user_statistics
WHERE user_id = 'user123';
```

## Maintenance

### Regular Maintenance Tasks

```sql
-- Vacuum and analyze for optimal performance
VACUUM ANALYZE jobs;
VACUUM ANALYZE media_outputs;

-- Check table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;
```

### Cleanup Old Data

```sql
-- Delete failed jobs older than 30 days
DELETE FROM jobs
WHERE status = 'failed'
  AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';

-- Archive completed jobs older than 90 days
-- (Consider moving to separate archive table or S3)
```

## Migration Strategy

### Version Tracking
Migrations are tracked in the `schema_migrations` table.

Current version: **1.0.0**

### Future Migrations
Create new migration files as `migrations/V{version}__description.sql`:

```sql
-- Example: migrations/V1.1.0__add_user_preferences.sql
CREATE TABLE user_preferences (
    user_id VARCHAR(255) PRIMARY KEY,
    notification_enabled BOOLEAN DEFAULT TRUE,
    preferred_models JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version, description) VALUES
    ('1.1.0', 'Add user_preferences table');
```

## Performance Tuning

### Recommended PostgreSQL Settings (RDS)
```ini
shared_buffers = 256MB  # 25% of RAM
effective_cache_size = 1GB  # 50-75% of RAM
work_mem = 16MB
maintenance_work_mem = 128MB
max_connections = 100
```

### Connection Pooling
Use PgBouncer or RDS Proxy for Lambda connection pooling:
- Pool mode: Transaction
- Pool size: 20-50 connections
- Timeout: 30 seconds

## Backup & Recovery

### Automated Backups (RDS)
- Retention: 7 days minimum
- Backup window: During low traffic hours
- Cross-region replication: Enabled (for production)

### Point-in-Time Recovery
```sql
-- RDS allows PITR to any point within retention period
-- Recovery via AWS Console or CLI
```

### Manual Backup
```bash
# Export entire database
pg_dump -h your-endpoint.amazonaws.com -U username -d dbname > backup.sql

# Restore from backup
psql -h your-endpoint.amazonaws.com -U username -d dbname < backup.sql
```

## Monitoring

### Key Metrics to Monitor
- Connection count
- Query execution time
- Table size growth
- Index hit rate
- Replication lag (if using read replicas)

### CloudWatch Metrics
- CPUUtilization
- DatabaseConnections
- FreeStorageSpace
- ReadLatency / WriteLatency

## Security

### Best Practices
1. Use IAM authentication for RDS access
2. Enable SSL/TLS for connections
3. Rotate credentials regularly
4. Use security groups to limit access
5. Enable encryption at rest
6. Regular security audits

### Connection String Format
```
postgresql://username:password@endpoint:5432/dbname?sslmode=require
```

## Troubleshooting

### Common Issues

#### Connection Pooling Exhaustion
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Kill idle connections
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND state_change < CURRENT_TIMESTAMP - INTERVAL '10 minutes';
```

#### Slow Queries
```sql
-- Enable logging
ALTER DATABASE your_db SET log_min_duration_statement = 1000; -- Log queries > 1s

-- Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

#### Table Bloat
```sql
-- Check for bloat
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    n_dead_tup
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;

-- Fix with VACUUM
VACUUM FULL jobs;  -- Locks table, use during maintenance window
VACUUM ANALYZE jobs;  -- Preferred, no lock
```

## Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [AWS RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_PostgreSQL.html)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
