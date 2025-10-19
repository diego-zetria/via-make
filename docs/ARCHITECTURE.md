# VSL Media Generation System - Architecture Design

## Overview
AI-powered media generation system (video, image, audio) using Replicate API with AWS serverless infrastructure.

## System Prefix
All resources use the prefix: **`vsl-homolog`**

## Core Technologies
- **Compute**: AWS Lambda (Node.js 20.x, AWS SDK v3)
- **API**: API Gateway HTTP API
- **Storage**: S3 for media files
- **Databases**:
  - PostgreSQL: Primary data store (jobs, users, configurations)
  - Redis (ElastiCache): High-speed cache and rate limiting
  - DynamoDB: Real-time job tracking and webhook processing
- **AI**: Replicate API for media generation
- **Monitoring**: CloudWatch Logs + Metrics
- **IaC**: Serverless Framework

## Architecture Diagram

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────┐
│     API Gateway (HTTP API)              │
│  /generate-media                        │
│  /status/{jobId}                        │
│  /webhook/replicate                     │
└────────────┬────────────────────────────┘
             │
     ┌───────┴───────┐
     │               │
     ▼               ▼
┌─────────┐    ┌──────────┐
│generate-│    │process-  │
│media    │    │webhook   │
│Lambda   │    │Lambda    │
└────┬────┘    └────┬─────┘
     │              │
     ├──────┬───────┼──────┬────────┐
     │      │       │      │        │
     ▼      ▼       ▼      ▼        ▼
┌─────┐ ┌─────┐ ┌──────┐ ┌─────┐ ┌──────────┐
│Redis│ │Dyna │ │Post  │ │  S3 │ │Replicate │
│     │ │moDB │ │greSQL│ │     │ │   API    │
└─────┘ └─────┘ └──────┘ └─────┘ └──────────┘
```

## Data Flow

### 1. Media Generation Request
```
Client → API Gateway → generate-media Lambda
  ↓
  ├→ Validate input (JSON schema)
  ├→ Check Redis rate limit
  ├→ Create job in PostgreSQL
  ├→ Create tracking entry in DynamoDB
  ├→ Call Replicate API (with webhook URL)
  └→ Return jobId to client
```

### 2. Webhook Processing
```
Replicate → API Gateway → process-webhook Lambda
  ↓
  ├→ Check Redis for deduplication
  ├→ Lookup job from DynamoDB (fast) or PostgreSQL (fallback)
  ├→ Download media from Replicate URL
  ├→ Upload to S3 (organized by user/date/jobId)
  ├→ Update PostgreSQL (permanent record)
  ├→ Update DynamoDB (real-time status)
  ├→ Update Redis cache
  └→ Send CloudWatch metrics
```

### 3. Status Check
```
Client → API Gateway → get-status Lambda
  ↓
  ├→ Check Redis cache (fastest)
  ├→ Check DynamoDB (if not in cache)
  ├→ Check PostgreSQL (if needed)
  └→ Return status + media URLs
```

## Database Schemas

### PostgreSQL (Primary Data)
- **jobs**: Main job tracking with full history
- **media_outputs**: Generated media metadata
- **model_configurations**: Dynamic model registry (optional)

See: `database/schema.sql`

### Redis (Cache)
- `job:status:{jobId}` → Job status (TTL: 5min)
- `ratelimit:user:{userId}:{window}` → Rate limiting (TTL: 1h)
- `models:config:v1` → Parsed model configuration (TTL: 1h)
- `webhook:processed:{replicateId}` → Deduplication (TTL: 2h)

### DynamoDB (Real-time Tracking)
- **vsl-homolog-realtime-jobs**
  - PK: jobId
  - SK: timestamp
  - GSI1: userId + timestamp (user queries)
  - GSI2: replicateId + timestamp (webhook lookup)
  - TTL: 7 days auto-cleanup

## Lambda Functions

### 1. generate-media
- **Purpose**: Create media generation jobs
- **Memory**: 1024 MB
- **Timeout**: 30s
- **Trigger**: API Gateway POST /generate-media
- **Environment**: Dynamic model configuration

### 2. process-webhook
- **Purpose**: Handle Replicate callbacks
- **Memory**: 2048 MB
- **Timeout**: 300s (5min)
- **Trigger**: API Gateway POST /webhook/replicate
- **Features**: Downloads media, uploads to S3, updates all databases

### 3. get-status
- **Purpose**: Check job status
- **Memory**: 512 MB
- **Timeout**: 10s
- **Trigger**: API Gateway GET /status/{jobId}
- **Features**: Multi-layer cache lookup

### 4. check-replicate-status (Optional)
- **Purpose**: Poll Replicate for status (backup for webhook failures)
- **Memory**: 512 MB
- **Timeout**: 30s
- **Trigger**: EventBridge Schedule (every 5 minutes)

## Dynamic Model Configuration

Models are defined via environment variables, not hardcoded:

```json
{
  "video": {
    "stability-video": {
      "version": "stability-ai/stable-video-diffusion",
      "pricing": 0.05,
      "estimatedTime": 60,
      "supportedParams": ["motion_bucket_id", "fps", "num_frames"]
    }
  },
  "image": {
    "flux-schnell": {
      "version": "black-forest-labs/flux-schnell",
      "pricing": 0.003,
      "estimatedTime": 5
    }
  },
  "audio": {
    "musicgen": {
      "version": "meta/musicgen",
      "pricing": 0.02,
      "estimatedTime": 30
    }
  }
}
```

## S3 Bucket Organization

```
vsl-homolog-media/
├── videos/{userId}/{YYYY}/{MM}/{DD}/{jobId}/
│   ├── original.mp4
│   ├── thumbnail.jpg
│   ├── preview.gif
│   └── metadata.json
├── images/{userId}/{YYYY}/{MM}/{DD}/{jobId}/
│   ├── original.png
│   ├── thumbnail.jpg
│   └── metadata.json
├── audio/{userId}/{YYYY}/{MM}/{DD}/{jobId}/
│   ├── original.mp3
│   ├── waveform.png
│   └── metadata.json
└── temp/{jobId}/ (auto-delete after 24h)
```

## Security & DevSecOps

### Authentication & Authorization
- API Gateway API keys for external access
- Optional: Lambda authorizer for user authentication
- Redis-based rate limiting (per user/IP)

### Secrets Management
- AWS Secrets Manager: REPLICATE_API_TOKEN
- AWS Systems Manager Parameter Store: DATABASE_URL, REDIS_URL
- No secrets in code or logs

### Network Security
- Lambda in VPC private subnets
- NAT Gateway for internet access (Replicate API)
- VPC endpoints for AWS services (S3, DynamoDB, Secrets Manager)
- Security groups for PostgreSQL/Redis access

### Data Protection
- S3 server-side encryption (AES-256)
- PostgreSQL encryption at rest
- TLS 1.2+ for all data in transit
- Signed S3 URLs for media access (optional)

## CloudWatch Monitoring

### Log Groups
- `/aws/lambda/vsl-homolog-generate-media`
- `/aws/lambda/vsl-homolog-process-webhook`
- `/aws/lambda/vsl-homolog-get-status`
- `/aws/lambda/vsl-homolog-check-replicate-status`

### Custom Metrics (Namespace: VSL/MediaGeneration)
- JobsStarted (dimensions: mediaType, modelId)
- JobsCompleted (dimensions: mediaType, modelId)
- JobsFailed (dimensions: mediaType, modelId, errorType)
- ProcessingTime (dimensions: mediaType, modelId)
- WebhookLatency
- S3UploadTime
- DatabaseWriteTime
- CacheHitRate

### Structured Logging
All logs use JSON format with fields: timestamp, level, jobId, userId, action, mediaType, modelId, duration, error, metadata

## Improvements Over Existing Systems

### Performance
- Multi-layer caching (Redis → DynamoDB → PostgreSQL)
- AWS SDK v3 with tree-shaking (~60% smaller packages)
- Parallel database writes
- Connection pooling for PostgreSQL

### Reliability
- Retry logic with exponential backoff
- Webhook deduplication
- Dead letter queues for failed processing
- Graceful degradation (serve from cache if DB slow)

### Scalability
- DynamoDB auto-scaling
- Lambda concurrency limits
- S3 lifecycle policies
- Serverless architecture (no server management)

### Maintainability
- Environment-driven configuration
- Structured logging with CloudWatch Insights
- Type validation with JSON schemas
- Comprehensive error handling

### Security
- VPC isolation
- Secrets management
- Encryption at rest and in transit
- Least privilege IAM policies

## Cost Optimization

### Compute
- Lambda right-sizing per function
- Pay-per-request API Gateway

### Storage
- S3 Intelligent-Tiering for automatic optimization
- Lifecycle policies for archival
- DynamoDB on-demand pricing

### Database
- ElastiCache Redis for reduced RDS queries
- DynamoDB TTL for automatic cleanup
- Connection pooling to reduce RDS costs

### Monitoring
- CloudWatch Logs retention (30 days)
- Metrics filtered to essential KPIs

## Disaster Recovery

### Backup Strategy
- PostgreSQL: Automated daily snapshots (7-day retention)
- S3: Versioning enabled + Cross-region replication (optional)
- DynamoDB: Point-in-time recovery enabled

### Recovery Procedures
- RTO (Recovery Time Objective): < 4 hours
- RPO (Recovery Point Objective): < 1 hour
- Documented runbooks for common failures

## Deployment Strategy

### Environments
- **Development**: `vsl-dev` prefix
- **Staging**: `vsl-staging` prefix
- **Homolog**: `vsl-homolog` prefix (current)
- **Production**: `vsl-prod` prefix (future)

### CI/CD Pipeline (Recommended)
1. Code push to GitHub
2. GitHub Actions runs tests
3. Serverless deploy to staging
4. Integration tests on staging
5. Manual approval
6. Deploy to production
7. Smoke tests

### Rollback Strategy
- Keep last 3 Lambda versions
- Blue/green deployment via API Gateway stages
- Automated rollback on CloudWatch alarm triggers

## Testing Strategy

### Unit Tests
- Lambda function logic
- Model configuration parsing
- Input validation

### Integration Tests
- API Gateway → Lambda → DynamoDB
- Webhook processing flow
- S3 upload/download

### End-to-End Tests
- Full generation workflow
- Status checking
- Error scenarios

### Load Tests
- Replicate API call concurrency
- Database connection pooling
- S3 upload performance

## Next Steps

1. ✅ Architecture design complete
2. 🔄 PostgreSQL schema creation
3. ⏳ Lambda function implementation
4. ⏳ Serverless Framework configuration
5. ⏳ API documentation
6. ⏳ Testing procedures

## References

- [Replicate API Documentation](https://replicate.com/docs)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [Serverless Framework Docs](https://www.serverless.com/framework/docs)
