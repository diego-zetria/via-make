# VSL Media Generation System

AI-powered media generation system (video, image, audio) using Replicate API with AWS serverless infrastructure and FFmpeg video compilation.

## 🎯 Overview

VSL is a production-ready serverless system for generating AI media through Replicate's API. It provides:

- **Multi-format support**: Video, image, and audio generation
- **Video compilation**: FFmpeg-powered video concatenation via AWS Lambda
- **Video approval workflow**: Review and approve generated videos before compilation
- **Dynamic configuration**: Environment-driven model registry (no code changes needed)
- **Multi-database architecture**: PostgreSQL (primary), Redis (cache), DynamoDB (real-time)
- **Scalable infrastructure**: AWS Lambda + API Gateway + S3
- **Comprehensive monitoring**: CloudWatch Logs + Metrics with structured logging

## 🏗️ Architecture

```
Client → API Gateway → Lambda Functions
                         ↓
         ┌───────────────┼───────────────┐
         ↓               ↓               ↓
     PostgreSQL       Redis          DynamoDB
         ↓               ↓               ↓
         └───────────────┴───────→ S3 Bucket
```

**Key Components**:
- **Generate Media Lambda**: Creates jobs, calls Replicate API
- **Process Webhook Lambda**: Handles Replicate callbacks, downloads/uploads media
- **Get Status Lambda**: Multi-layer cache for fast status checks
- **Compile Videos Lambda**: Concatenates approved videos using FFmpeg
- **Node.js Backend**: Video approval workflow and compilation orchestration
- **PostgreSQL**: Primary data store with full job history and video approval status
- **Redis**: High-speed cache and rate limiting
- **DynamoDB**: Real-time job tracking with TTL cleanup
- **S3**: Organized media storage with lifecycle policies

## 📁 Project Structure

```
vsl/
├── handlers/              # Lambda function handlers
│   ├── lib/              # Shared utilities (logger, database, s3)
│   ├── generate-media.js # Video/image generation
│   ├── process-webhook.js # Replicate webhook handler
│   ├── get-status.js     # Job status lookup
│   └── compile-videos.js # FFmpeg video compilation
├── backend/              # Node.js Express backend
│   ├── src/
│   │   ├── routes/      # API routes (scripts, webhooks, videos)
│   │   ├── agents/      # AI agent system
│   │   ├── middleware/  # Express middleware
│   │   └── utils/       # Utilities
│   ├── prisma/          # Database schema and migrations
│   └── tests/           # Integration and E2E tests
├── frontend/            # Next.js frontend
│   └── app/vsl/editor/  # VSL editor with video approval
├── database/            # PostgreSQL schemas
├── docs/                # Documentation
├── config/              # Configuration files
└── serverless.yml       # Infrastructure as Code
```

## 🚀 Quick Start

### Prerequisites

1. **AWS Account** with appropriate permissions
2. **Node.js 20.x** installed
3. **PostgreSQL database** (RDS recommended)
4. **Redis cluster** (ElastiCache recommended)
5. **Replicate API token** from [replicate.com](https://replicate.com)

### Setup

1. **Clone the repository**
```bash
git clone https://github.com/your-org/vsl.git
cd vsl
```

2. **Install dependencies**
```bash
cd handlers
npm install
```

3. **Configure AWS Systems Manager parameters**
```bash
aws ssm put-parameter \
  --name /vsl/database-url \
  --value "postgresql://user:pass@endpoint:5432/dbname" \
  --type SecureString

aws ssm put-parameter \
  --name /vsl/redis-url \
  --value "redis://endpoint:6379" \
  --type SecureString

aws ssm put-parameter \
  --name /vsl/replicate-token \
  --value "r8_xxxxxxxxxxxxx" \
  --type SecureString
```

4. **Create PostgreSQL schema**
```bash
psql -h your-rds-endpoint.com -U username -d dbname -f database/schema.sql
```

5. **Deploy to AWS**
```bash
npm install -g serverless
serverless deploy --stage homolog --region us-east-1
```

## 📖 Documentation

- **[Architecture](docs/ARCHITECTURE.md)**: Complete system architecture
- **[Video Compilation](docs/VIDEO_COMPILATION.md)**: FFmpeg video compilation system
- **[API Reference](docs/API.md)**: API endpoints and usage
- **[Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md)**: Development guide
- **[Database Schema](database/README.md)**: PostgreSQL setup and queries

## 🔧 Configuration

### Environment Variables

All configuration is managed through environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://...` |
| `REDIS_URL` | Redis connection | `redis://...` |
| `REPLICATE_API_TOKEN` | Replicate API key | `r8_...` |
| `MODELS_CONFIG` | Model definitions | JSON string |
| `S3_BUCKET` | Media storage bucket | `vsl-homolog-media` |
| `DYNAMODB_TABLE` | DynamoDB table | `vsl-homolog-realtime-jobs` |

### Model Configuration

Models are defined in `config/models.json`. Add new models without code changes:

```json
{
  "image": {
    "your-model": {
      "version": "owner/model:version",
      "pricing": 0.01,
      "estimatedTime": 10,
      "supportedParams": ["prompt", "width", "height"],
      "defaults": {
        "width": 1024,
        "height": 1024
      }
    }
  }
}
```

## 💡 Usage Examples

### Generate an Image

```bash
curl -X POST https://xxx.execute-api.us-east-1.amazonaws.com/homolog/generate-media \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "userId": "user123",
    "mediaType": "image",
    "modelId": "flux-schnell",
    "parameters": {
      "prompt": "A beautiful sunset over mountains",
      "width": 1024,
      "height": 1024
    }
  }'
```

Response:
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "estimatedTime": 5,
  "estimatedCost": 0.003
}
```

### Check Status

```bash
curl https://xxx.execute-api.us-east-1.amazonaws.com/homolog/status/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-API-Key: your-key"
```

Response:
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed",
  "result": {
    "originalUrl": "https://vsl-homolog-media.s3.amazonaws.com/...",
    "thumbnailUrl": "https://vsl-homolog-media.s3.amazonaws.com/...",
    "fileSize": 2048576
  }
}
```

## 🎨 Supported Models

### Images
- **flux-schnell**: Fast generation ($0.003, ~5s)
- **sdxl**: High quality ($0.01, ~10s)

### Videos
- **stability-video**: Image-to-video ($0.05, ~60s)

### Audio
- **musicgen**: Text-to-music ($0.02, ~30s)

See [API Documentation](docs/API.md) for complete model list and parameters.

## 📊 Monitoring

### CloudWatch Logs

Structured JSON logging for easy parsing:

```json
{
  "timestamp": "2025-10-18T10:30:00Z",
  "level": "INFO",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user123",
  "action": "generation_completed",
  "mediaType": "image",
  "modelId": "flux-schnell",
  "duration": 5234
}
```

### CloudWatch Metrics

Custom metrics in namespace `VSL/MediaGeneration`:
- JobsStarted
- JobsCompleted
- JobsFailed
- ProcessingTime
- WebhookLatency
- CacheHitRate

### CloudWatch Insights Queries

```sql
-- Error analysis by model
fields @timestamp, jobId, modelId, error
| filter level = "ERROR"
| stats count() by modelId
```

## 🔒 Security

- **VPC Isolation**: Lambdas run in private subnets
- **Secrets Management**: AWS Secrets Manager for sensitive data
- **Encryption**: At rest (S3, RDS) and in transit (TLS)
- **IAM Least Privilege**: Minimal permissions per function
- **API Authentication**: API Gateway API keys

## 💰 Cost Optimization

- **Pay-per-request**: DynamoDB and API Gateway on-demand pricing
- **Lambda right-sizing**: Appropriate memory for each function
- **S3 lifecycle policies**: Automatic archival to Glacier
- **Connection pooling**: Reuse database connections
- **Redis caching**: Reduce database queries

Estimated cost for 1000 generations/day: **~$30-50/month** (AWS) + **~$10-100** (Replicate, depends on models)

## 🎬 Video Compilation

### FFmpeg-Powered Video Concatenation

The system includes a serverless video compilation feature using FFmpeg in AWS Lambda:

**Features**:
- **Video Approval Workflow**: Review and approve AI-generated videos
- **FFmpeg Concat**: Fast concatenation without re-encoding (copy codec)
- **S3 Storage**: Compiled videos stored permanently in S3
- **Download Support**: Direct download with cross-origin blob handling

**Performance**:
- 3 videos (6.75MB): ~0.55s
- No quality loss (copy codec, no re-encoding)
- Minimal cost (~$0.000016 per compilation)

**Example**:
```bash
# 1. Generate videos via frontend
# 2. Approve videos (POST /api/section-videos/:videoId/approve)
# 3. Compile (POST /api/scripts/:scriptId/compile)

curl -X POST http://localhost:3001/api/scripts/67890/compile \
  -H "Content-Type: application/json" \
  -d '{
    "outputFormat": "mp4",
    "quality": "high"
  }'
```

**Response**:
```json
{
  "success": true,
  "data": {
    "compiledVideoUrl": "https://vsl-homolog-media.s3.amazonaws.com/compiled/final-67890.mp4",
    "videoCount": 3,
    "fileSize": 7085456,
    "duration": 550
  }
}
```

See [Video Compilation Documentation](docs/VIDEO_COMPILATION.md) for complete details.

## 🧪 Testing

### Unit Tests
```bash
cd handlers
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### Load Tests
```bash
npm run test:load
```

## 🚢 Deployment

### Development
```bash
serverless deploy --stage dev
```

### Staging
```bash
serverless deploy --stage staging
```

### Production
```bash
serverless deploy --stage prod
```

## 📈 Roadmap

- [x] Complete Lambda handler implementations
- [x] Video compilation with FFmpeg
- [x] Video approval workflow
- [x] Webhook support for Replicate callbacks
- [x] Backend integration with Node.js/Express
- [x] Frontend video editor with Next.js
- [ ] Unit and integration tests (partial)
- [ ] CI/CD pipeline with GitHub Actions
- [ ] Admin dashboard
- [ ] User authentication (Cognito)
- [ ] Multi-region deployment
- [ ] Cost analytics dashboard
- [ ] Compilation with transitions and audio
- [ ] Multiple output formats (WebM, AVI)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

Proprietary - All rights reserved

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-org/vsl/issues)
- **Email**: support@yourcompany.com
- **Documentation**: [Full Docs](https://docs.yourcompany.com/vsl)

## 👥 Team

Developed by the VSL Team

---

**Made with ❤️ using AWS, Replicate, and lots of ☕**
