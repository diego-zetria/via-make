# VSL Media Generation System - Implementation Summary

## 📋 Project Structure

```
vsl/
├── handlers/                    # Lambda function handlers
│   ├── lib/                     # Shared utilities
│   │   ├── logger.js           ✅ Structured JSON logging
│   │   ├── database.js         ✅ Multi-DB connection management
│   │   ├── replicate.js        ⏳ Replicate API client
│   │   ├── models.js           ⏳ Dynamic model configuration
│   │   ├── s3.js               ⏳ S3 upload utilities
│   │   └── metrics.js          ⏳ CloudWatch metrics
│   ├── generate-media.js       ⏳ Main generation handler
│   ├── process-webhook.js      ⏳ Webhook processor
│   ├── get-status.js           ⏳ Status checker
│   ├── check-replicate-status.js ⏳ Polling handler
│   └── package.json            ✅ Dependencies
├── database/                    # Database schemas
│   ├── schema.sql              ✅ PostgreSQL schema
│   └── README.md               ✅ DB documentation
├── docs/                        # Documentation
│   ├── ARCHITECTURE.md         ✅ System architecture
│   ├── IMPLEMENTATION_SUMMARY.md ✅ This file
│   └── API.md                  ⏳ API documentation
├── config/                      # Configuration files
│   └── models.json             ⏳ Model definitions
├── serverless.yml              ⏳ Infrastructure as Code
├── .env.example                ⏳ Environment template
└── README.md                   ⏳ Project README
```

## 🎯 Implementation Status

### ✅ Completed
1. **Architecture Design** - Comprehensive system architecture document
2. **PostgreSQL Schema** - Complete database schema with indexes, views, triggers
3. **Utility Libraries**:
   - Structured logger with JSON format for CloudWatch Insights
   - Multi-database connector (PostgreSQL, Redis, DynamoDB)

### ⏳ Remaining Implementation

#### Handler Files (To Be Created)

**lib/replicate.js** - Replicate API Client
```javascript
// Core functionality:
- createPrediction(modelVersion, input, webhookUrl)
- getPrediction(predictionId)
- cancelPrediction(predictionId)
- Retry logic with exponential backoff
- Error handling and logging
```

**lib/models.js** - Dynamic Model Configuration
```javascript
// Core functionality:
- loadModelsConfig() - Parse MODELS_CONFIG env var
- validateModelId(modelId, mediaType)
- getModelConfig(modelId)
- validateParameters(modelId, params)
- buildReplicateInput(modelId, params)
```

**lib/s3.js** - S3 Upload Utilities
```javascript
// Core functionality:
- generateS3Key(userId, mediaType, jobId, filename)
- uploadMedia(buffer, s3Key, contentType, metadata)
- downloadFromUrl(url)
- generateSignedUrl(s3Key, expiresIn)
```

**lib/metrics.js** - CloudWatch Metrics
```javascript
// Core functionality:
- sendMetric(metricName, value, dimensions, unit)
- recordJobStarted(mediaType, modelId)
- recordJobCompleted(mediaType, modelId, processingTime)
- recordJobFailed(mediaType, modelId, errorType)
- recordWebhookLatency(latencyMs)
```

#### Lambda Handlers

**generate-media.js** - Main Generation Handler
```javascript
// Flow:
1. Parse and validate request body
2. Check Redis rate limit (ratelimit:user:{userId}:hour)
3. Parse MODELS_CONFIG, validate model + parameters
4. Generate jobId (UUID)
5. Create job in PostgreSQL
6. Create tracking entry in DynamoDB
7. Call Replicate API with webhook URL
8. Update databases with replicate_id
9. Send CloudWatch metrics
10. Return response with jobId

// Input:
{
  userId: string,
  mediaType: 'video'|'image'|'audio',
  modelId: string,
  parameters: object (dynamic based on model),
  prompt: string (optional)
}

// Output:
{
  jobId: string,
  status: 'pending',
  estimatedTime: number,
  estimatedCost: number,
  replicateId: string
}
```

**process-webhook.js** - Webhook Processor
```javascript
// Flow:
1. Parse Replicate webhook payload
2. Check Redis deduplication (webhook:processed:{replicateId})
3. Lookup job from DynamoDB (GSI on replicateId)
4. Download media from Replicate output URL
5. Upload to S3 with organized structure
6. Update PostgreSQL (status, s3_url, metadata)
7. Update DynamoDB (realtime tracking)
8. Update Redis cache (job:status:{jobId})
9. Send CloudWatch metrics
10. Return 200 OK

// Handles statuses: succeeded, failed, canceled
```

**get-status.js** - Status Checker
```javascript
// Flow (multi-layer cache):
1. Check Redis cache (job:status:{jobId}) - fastest
2. If not in cache, check DynamoDB - fast
3. If not in DynamoDB, check PostgreSQL - authoritative
4. Update Redis cache with result
5. Return status + media URLs

// Output:
{
  jobId: string,
  status: string,
  mediaType: string,
  modelId: string,
  createdAt: timestamp,
  completedAt: timestamp?,
  result: {
    originalUrl: string,
    thumbnailUrl: string,
    s3Path: string,
    fileSize: number,
    duration?: number,
    width?: number,
    height?: number
  }?,
  error?: string
}
```

**check-replicate-status.js** - Polling Handler (Optional)
```javascript
// Flow:
1. Query DynamoDB for jobs with status='processing'
2. For each job without recent webhook update:
   - Call Replicate API to get current status
   - If status changed, update databases
   - If completed, trigger download + upload flow
3. Send CloudWatch metrics

// Triggered by: EventBridge Schedule (every 5 minutes)
```

## 🔧 Serverless Framework Configuration

**serverless.yml** - Infrastructure as Code
```yaml
service: vsl-homolog

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  stage: ${opt:stage, 'homolog'}

  # VPC configuration for database access
  vpc:
    securityGroupIds:
      - ${env:SECURITY_GROUP_ID}
    subnetIds:
      - ${env:SUBNET_ID_A}
      - ${env:SUBNET_ID_B}

  # Environment variables
  environment:
    STAGE: ${self:provider.stage}
    DATABASE_URL: ${ssm:/vsl/database-url}
    REDIS_URL: ${ssm:/vsl/redis-url}
    REPLICATE_API_TOKEN: ${ssm:/vsl/replicate-token}
    MODELS_CONFIG: ${file(config/models.json)}
    WEBHOOK_BASE_URL: !Sub '${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${self:provider.stage}'
    DYNAMODB_TABLE: vsl-homolog-realtime-jobs
    S3_BUCKET: vsl-homolog-media

  # IAM permissions
  iam:
    role:
      statements:
        - Effect: Allow
          Action:
            - dynamodb:*
          Resource:
            - !GetAtt RealtimeJobsTable.Arn
            - !Sub '${RealtimeJobsTable.Arn}/index/*'
        - Effect: Allow
          Action:
            - s3:PutObject
            - s3:GetObject
          Resource: !Sub '${MediaBucket.Arn}/*'
        - Effect: Allow
          Action: cloudwatch:PutMetricData
          Resource: '*'
        - Effect: Allow
          Action: ssm:GetParameter
          Resource: 'arn:aws:ssm:${AWS::Region}:${AWS::AccountId}:parameter/vsl/*'

functions:
  generateMedia:
    handler: handlers/generate-media.handler
    timeout: 30
    memorySize: 1024
    events:
      - http:
          path: /generate-media
          method: post
          cors: true

  processWebhook:
    handler: handlers/process-webhook.handler
    timeout: 300
    memorySize: 2048
    events:
      - http:
          path: /webhook/replicate
          method: post

  getStatus:
    handler: handlers/get-status.handler
    timeout: 10
    memorySize: 512
    events:
      - http:
          path: /status/{jobId}
          method: get
          cors: true

  checkReplicateStatus:
    handler: handlers/check-replicate-status.handler
    timeout: 30
    memorySize: 512
    events:
      - schedule:
          rate: rate(5 minutes)
          enabled: true

resources:
  Resources:
    # DynamoDB Table
    RealtimeJobsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: vsl-homolog-realtime-jobs
        BillingMode: PAY_PER_REQUEST
        AttributeDefinitions:
          - AttributeName: jobId
            AttributeType: S
          - AttributeName: timestamp
            AttributeType: N
          - AttributeName: userId
            AttributeType: S
          - AttributeName: replicateId
            AttributeType: S
        KeySchema:
          - AttributeName: jobId
            KeyType: HASH
          - AttributeName: timestamp
            KeyType: RANGE
        GlobalSecondaryIndexes:
          - IndexName: UserIdIndex
            KeySchema:
              - AttributeName: userId
                KeyType: HASH
              - AttributeName: timestamp
                KeyType: RANGE
            Projection:
              ProjectionType: ALL
          - IndexName: ReplicateIdIndex
            KeySchema:
              - AttributeName: replicateId
                KeyType: HASH
            Projection:
              ProjectionType: ALL
        TimeToLiveSpecification:
          AttributeName: ttl
          Enabled: true
        Tags:
          - Key: Project
            Value: VSL
          - Key: Environment
            Value: ${self:provider.stage}

    # S3 Bucket
    MediaBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: vsl-homolog-media
        CorsConfiguration:
          CorsRules:
            - AllowedOrigins: ['*']
              AllowedMethods: [GET, PUT, POST]
              AllowedHeaders: ['*']
              MaxAge: 3000
        LifecycleConfiguration:
          Rules:
            - Id: DeleteTempFiles
              Status: Enabled
              ExpirationInDays: 1
              Prefix: temp/
            - Id: ArchiveOldMedia
              Status: Enabled
              Transitions:
                - StorageClass: GLACIER
                  TransitionInDays: 90
        PublicAccessBlockConfiguration:
          BlockPublicAcls: false
          BlockPublicPolicy: false
        Tags:
          - Key: Project
            Value: VSL

    # Bucket Policy
    MediaBucketPolicy:
      Type: AWS::S3::BucketPolicy
      Properties:
        Bucket: !Ref MediaBucket
        PolicyDocument:
          Statement:
            - Sid: PublicRead
              Effect: Allow
              Principal: '*'
              Action: s3:GetObject
              Resource: !Sub '${MediaBucket.Arn}/*'

  Outputs:
    ApiEndpoint:
      Value: !Sub 'https://${ApiGatewayRestApi}.execute-api.${AWS::Region}.amazonaws.com/${self:provider.stage}'
```

## 🔐 Environment Variables

**Required Environment Variables** (via AWS Systems Manager Parameter Store):

```bash
# Database connections
/vsl/database-url = "postgresql://user:pass@rds-endpoint:5432/vsldb"
/vsl/redis-url = "redis://elasticache-endpoint:6379"

# API tokens
/vsl/replicate-token = "r8_xxxxxxxxxxxxx"

# AWS configuration (set by Lambda runtime)
AWS_REGION = "us-east-1"

# Application configuration (set in serverless.yml)
STAGE = "homolog"
DYNAMODB_TABLE = "vsl-homolog-realtime-jobs"
S3_BUCKET = "vsl-homolog-media"
WEBHOOK_BASE_URL = "https://xxx.execute-api.us-east-1.amazonaws.com/homolog"
MODELS_CONFIG = "{...json...}"
```

## 📊 Model Configuration Example

**config/models.json**:
```json
{
  "video": {
    "stability-video": {
      "version": "stability-ai/stable-video-diffusion",
      "pricing": 0.05,
      "estimatedTime": 60,
      "supportedParams": ["image", "motion_bucket_id", "fps", "num_frames"],
      "defaults": {
        "motion_bucket_id": 127,
        "fps": 24,
        "num_frames": 25
      }
    }
  },
  "image": {
    "flux-schnell": {
      "version": "black-forest-labs/flux-schnell",
      "pricing": 0.003,
      "estimatedTime": 5,
      "supportedParams": ["prompt", "width", "height", "num_outputs"],
      "defaults": {
        "width": 1024,
        "height": 1024,
        "num_outputs": 1
      }
    },
    "sdxl": {
      "version": "stability-ai/sdxl",
      "pricing": 0.01,
      "estimatedTime": 10,
      "supportedParams": ["prompt", "negative_prompt", "width", "height", "num_inference_steps"],
      "defaults": {
        "width": 1024,
        "height": 1024,
        "num_inference_steps": 50
      }
    }
  },
  "audio": {
    "musicgen": {
      "version": "meta/musicgen",
      "pricing": 0.02,
      "estimatedTime": 30,
      "supportedParams": ["prompt", "duration", "temperature", "top_k", "top_p"],
      "defaults": {
        "duration": 8,
        "temperature": 1.0,
        "top_k": 250,
        "top_p": 0.0
      }
    }
  }
}
```

## 🚀 Deployment Instructions

### Prerequisites
1. AWS CLI configured with appropriate credentials
2. Serverless Framework installed: `npm install -g serverless`
3. Node.js 20.x installed
4. PostgreSQL database provisioned (RDS)
5. Redis cluster provisioned (ElastiCache)

### Step 1: Set up AWS Systems Manager Parameters
```bash
aws ssm put-parameter --name /vsl/database-url --value "postgresql://..." --type SecureString
aws ssm put-parameter --name /vsl/redis-url --value "redis://..." --type SecureString
aws ssm put-parameter --name /vsl/replicate-token --value "r8_..." --type SecureString
```

### Step 2: Install dependencies
```bash
cd handlers
npm install
```

### Step 3: Create PostgreSQL schema
```bash
psql -h your-rds-endpoint.amazonaws.com -U username -d dbname -f database/schema.sql
```

### Step 4: Deploy infrastructure
```bash
serverless deploy --stage homolog --region us-east-1
```

### Step 5: Test the API
```bash
# Generate media
curl -X POST https://xxx.execute-api.us-east-1.amazonaws.com/homolog/generate-media \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "mediaType": "image",
    "modelId": "flux-schnell",
    "parameters": {
      "prompt": "A beautiful sunset over mountains"
    }
  }'

# Check status
curl https://xxx.execute-api.us-east-1.amazonaws.com/homolog/status/{jobId}
```

## 📝 Next Steps

### Immediate (Priority 1)
1. Complete remaining handler implementations (generate-media, process-webhook, get-status)
2. Complete utility libraries (replicate.js, models.js, s3.js, metrics.js)
3. Create complete serverless.yml configuration
4. Create .env.example template

### Short-term (Priority 2)
1. Unit tests for all handlers
2. Integration tests
3. API documentation (Swagger/OpenAPI)
4. Deployment scripts

### Medium-term (Priority 3)
1. Monitoring dashboard setup
2. CloudWatch alarms configuration
3. Load testing
4. Security audit

## 🧪 Testing Approach

### Unit Tests
- Test model configuration parsing
- Test parameter validation
- Test database operations
- Test S3 upload logic

### Integration Tests
- End-to-end generation workflow
- Webhook processing
- Status checking
- Error scenarios

### Load Tests
- Concurrent generation requests
- Database connection pooling
- S3 upload performance
- Replicate API rate limits

## 📚 References

- [Replicate API Documentation](https://replicate.com/docs/reference/http)
- [AWS Lambda Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)
- [Redis Best Practices](https://redis.io/topics/best-practices)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
