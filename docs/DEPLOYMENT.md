# VSL Media Generation System - Deployment Guide

Complete step-by-step guide for deploying the VSL system to AWS.

## Prerequisites

### Required Accounts & Tools
- ✅ AWS Account with appropriate permissions
- ✅ Node.js 20.x or higher installed
- ✅ AWS CLI configured with credentials
- ✅ Serverless Framework CLI installed
- ✅ Replicate account with API token
- ✅ PostgreSQL database (AWS RDS recommended)
- ✅ Redis cluster (AWS ElastiCache recommended)

### Verify Prerequisites
```bash
# Check Node.js version
node --version  # Should be v20.x or higher

# Check AWS CLI
aws --version
aws sts get-caller-identity  # Should return your AWS account info

# Check Serverless Framework
serverless --version  # Or: sls --version
```

## Step 1: Database Setup

### 1.1 Create PostgreSQL Database (AWS RDS)

```bash
# Option A: Using AWS Console
# 1. Go to RDS Console
# 2. Create Database → PostgreSQL
# 3. Instance type: db.t3.micro (for homolog) or db.t3.medium (for production)
# 4. Set username and password
# 5. Enable public accessibility (for initial setup)
# 6. Create database

# Option B: Using AWS CLI
aws rds create-db-instance \
  --db-instance-identifier vsl-homolog-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username vsluser \
  --master-user-password YourSecurePassword123 \
  --allocated-storage 20 \
  --vpc-security-group-ids sg-xxxxx \
  --db-subnet-group-name your-subnet-group \
  --publicly-accessible \
  --region us-east-1
```

### 1.2 Create Database Schema

```bash
# Connect to your PostgreSQL database
psql -h your-rds-endpoint.us-east-1.rds.amazonaws.com \
     -U vsluser \
     -d postgres

# Once connected, create the database
CREATE DATABASE vsl;

# Connect to the new database
\c vsl

# Run the schema file
\i database/schema.sql

# Verify tables were created
\dt

# You should see: jobs, media_outputs, model_configurations, usage_tracking
```

### 1.3 Create Redis Cluster (AWS ElastiCache)

```bash
# Using AWS Console (recommended for first time):
# 1. Go to ElastiCache Console
# 2. Create Redis cluster
# 3. Cluster mode: Disabled
# 4. Node type: cache.t3.micro
# 5. Number of replicas: 0 (for homolog) or 1 (for production)
# 6. Create

# Get the endpoint after creation
aws elasticache describe-cache-clusters \
  --cache-cluster-id vsl-homolog-redis \
  --show-cache-node-info \
  --region us-east-1
```

## Step 2: Replicate API Setup

### 2.1 Get API Token

1. Go to https://replicate.com/account/api-tokens
2. Create a new API token
3. Copy the token (format: `r8_xxxxxxxxxxxxx`)

### 2.2 Set Up Webhook Secret

1. Go to https://replicate.com/account/webhooks
2. Create a new webhook signing secret
3. Copy the secret (format: `whsec_xxxxxxxxxxxxx`)

**Note**: The webhook URL will be configured after deployment.

## Step 3: AWS Systems Manager Parameter Store Setup

Store all secrets in AWS SSM Parameter Store:

```bash
# Database URL
aws ssm put-parameter \
  --name /vsl/database-url \
  --value "postgresql://vsluser:YourPassword123@your-rds-endpoint.us-east-1.rds.amazonaws.com:5432/vsl" \
  --type SecureString \
  --region us-east-1

# Redis URL
aws ssm put-parameter \
  --name /vsl/redis-url \
  --value "redis://your-elasticache-endpoint.cache.amazonaws.com:6379" \
  --type SecureString \
  --region us-east-1

# Replicate API Token
aws ssm put-parameter \
  --name /vsl/replicate-token \
  --value "r8_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  --type SecureString \
  --region us-east-1

# Replicate Webhook Secret
aws ssm put-parameter \
  --name /vsl/webhook-secret \
  --value "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  --type SecureString \
  --region us-east-1

# Verify parameters were created
aws ssm get-parameters \
  --names /vsl/database-url /vsl/redis-url /vsl/replicate-token /vsl/webhook-secret \
  --with-decryption \
  --region us-east-1
```

## Step 4: Install Dependencies

```bash
# Navigate to the handlers directory
cd handlers

# Install Node.js dependencies
npm install

# Verify installation
npm list --depth=0
```

## Step 5: Deploy Infrastructure

### 5.1 Deploy to Homolog Environment

```bash
# From project root directory
cd /Users/diegoramos/Documents/cloudville/2025/vsl

# Deploy using Serverless Framework
serverless deploy --stage homolog --region us-east-1 --verbose

# This will:
# - Create API Gateway endpoints
# - Deploy Lambda functions
# - Create DynamoDB table
# - Create S3 bucket
# - Set up IAM roles and permissions
```

### 5.2 Save Deployment Outputs

After deployment, save the following information:

```bash
# API Gateway endpoint URL
# Example: https://abc123xyz.execute-api.us-east-1.amazonaws.com/homolog

# Save to your notes:
export API_ENDPOINT="https://your-api-id.execute-api.us-east-1.amazonaws.com/homolog"
export S3_BUCKET="vsl-homolog-media"
export DYNAMODB_TABLE="vsl-homolog-realtime-jobs"
```

## Step 6: Configure Replicate Webhook

After deployment, configure the webhook URL in Replicate:

```bash
# Your webhook URL will be:
# https://your-api-id.execute-api.us-east-1.amazonaws.com/homolog/webhook/replicate

# Test webhook signature validation:
curl -X POST $API_ENDPOINT/webhook/replicate \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'

# Should return 401 Unauthorized (signature validation working)
```

## Step 7: Verification & Testing

### 7.1 Verify Infrastructure

```bash
# Check Lambda functions
aws lambda list-functions \
  --query "Functions[?contains(FunctionName, 'vsl-homolog')]" \
  --region us-east-1

# Check DynamoDB table
aws dynamodb describe-table \
  --table-name vsl-homolog-realtime-jobs \
  --region us-east-1

# Check S3 bucket
aws s3 ls s3://vsl-homolog-media/

# Check API Gateway
aws apigateway get-rest-apis \
  --query "items[?contains(name, 'vsl-homolog')]" \
  --region us-east-1
```

### 7.2 Test API Endpoints

#### Test 1: Generate Image

```bash
curl -X POST $API_ENDPOINT/generate-media \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "mediaType": "image",
    "modelId": "flux-schnell",
    "parameters": {
      "prompt": "A beautiful sunset over mountains, vibrant colors, 4k quality"
    }
  }'

# Expected response (202 Accepted):
# {
#   "jobId": "550e8400-e29b-41d4-a716-446655440000",
#   "status": "pending",
#   "estimatedTime": 5,
#   "estimatedCost": 0.003,
#   "replicateId": "abc123...",
#   "message": "Media generation started"
# }

# Save the jobId for next test
export JOB_ID="550e8400-e29b-41d4-a716-446655440000"
```

#### Test 2: Check Job Status

```bash
# Immediately after creation (should be pending/processing)
curl $API_ENDPOINT/status/$JOB_ID

# Expected response:
# {
#   "jobId": "550e8400-e29b-41d4-a716-446655440000",
#   "status": "processing",
#   "mediaType": "image",
#   "modelId": "flux-schnell",
#   "userId": "test-user-123",
#   "createdAt": "2025-10-18T10:30:00Z"
# }

# Wait 10-30 seconds, then check again (should be completed)
curl $API_ENDPOINT/status/$JOB_ID

# Expected response when completed:
# {
#   "jobId": "550e8400-e29b-41d4-a716-446655440000",
#   "status": "completed",
#   "result": {
#     "originalUrl": "https://vsl-homolog-media.s3.amazonaws.com/...",
#     "s3Path": "image/test-user-123/2025/10/18/jobId/original.png",
#     "fileSize": 2048576
#   },
#   "processingTime": 8234,
#   "completedAt": "2025-10-18T10:30:15Z"
# }
```

#### Test 3: Generate Video

```bash
# First, upload a test image or use a URL
curl -X POST $API_ENDPOINT/generate-media \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-123",
    "mediaType": "video",
    "modelId": "stability-video",
    "parameters": {
      "image": "https://example.com/your-image.jpg",
      "motion_bucket_id": 127,
      "fps": 24
    }
  }'
```

#### Test 4: Rate Limiting

```bash
# Test rate limiting (100 requests/hour per user)
for i in {1..105}; do
  curl -X POST $API_ENDPOINT/generate-media \
    -H "Content-Type: application/json" \
    -d '{
      "userId": "rate-limit-test",
      "mediaType": "image",
      "modelId": "flux-schnell",
      "parameters": {"prompt": "test"}
    }'
  sleep 0.1
done

# After 100 requests, should receive:
# {
#   "error": "Rate limit exceeded",
#   "retryAfter": 3600
# }
```

### 7.3 Verify Databases

```bash
# Check PostgreSQL
psql -h your-rds-endpoint.us-east-1.rds.amazonaws.com -U vsluser -d vsl -c "SELECT job_id, status, media_type FROM jobs ORDER BY created_at DESC LIMIT 5;"

# Check DynamoDB
aws dynamodb scan \
  --table-name vsl-homolog-realtime-jobs \
  --limit 5 \
  --region us-east-1

# Check Redis (if accessible)
redis-cli -h your-elasticache-endpoint.cache.amazonaws.com
KEYS job:status:*
GET job:status:your-job-id
```

### 7.4 Check CloudWatch Logs

```bash
# Generate Media logs
aws logs tail /aws/lambda/vsl-homolog-generateMedia --follow --region us-east-1

# Process Webhook logs
aws logs tail /aws/lambda/vsl-homolog-processWebhook --follow --region us-east-1

# Get Status logs
aws logs tail /aws/lambda/vsl-homolog-getStatus --follow --region us-east-1

# Search for errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/vsl-homolog-generateMedia \
  --filter-pattern "ERROR" \
  --region us-east-1
```

## Step 8: Monitoring Setup

### 8.1 CloudWatch Metrics

The system automatically publishes custom metrics to CloudWatch:

```bash
# View metrics in CloudWatch Console
# Namespace: VSL/MediaGeneration
# Metrics:
# - JobsStarted
# - JobsCompleted
# - JobsFailed
# - ProcessingTime
# - WebhookLatency
# - CacheHitRate
```

### 8.2 CloudWatch Insights Queries

```sql
-- Find all errors in the last hour
fields @timestamp, @message, level, error
| filter level = "ERROR"
| sort @timestamp desc
| limit 100

-- Average processing time by model
fields @timestamp, modelId, processingTime
| filter processingTime > 0
| stats avg(processingTime) by modelId

-- Job success rate
fields @timestamp, status
| stats count() by status
```

## Troubleshooting

### Issue: Lambda timeout errors

**Solution**: Increase timeout in serverless.yml
```yaml
functions:
  processWebhook:
    timeout: 300  # Increase if needed
```

### Issue: Database connection errors

**Solution**: Check security groups and VPC configuration
```bash
# Verify Lambda can reach RDS
# Add Lambda to same VPC as RDS or configure VPC peering
```

### Issue: Webhook signature validation fails

**Solution**: Verify webhook secret matches Replicate
```bash
# Check SSM parameter
aws ssm get-parameter --name /vsl/webhook-secret --with-decryption --region us-east-1

# Update if needed
aws ssm put-parameter --name /vsl/webhook-secret --value "whsec_new_secret" --type SecureString --overwrite --region us-east-1

# Redeploy
serverless deploy --stage homolog --region us-east-1
```

### Issue: S3 upload permissions denied

**Solution**: Verify IAM role has S3 permissions
```bash
# Check IAM role in serverless.yml includes:
# - s3:PutObject
# - s3:GetObject
```

## Production Deployment

For production deployment, use a separate stage:

```bash
# Deploy to production
serverless deploy --stage prod --region us-east-1

# Use separate databases
# - RDS: vsl-prod-db (larger instance: db.t3.medium)
# - Redis: vsl-prod-redis (with replicas)
# - DynamoDB: vsl-prod-realtime-jobs (provisioned capacity)

# Update SSM parameters for prod
aws ssm put-parameter --name /vsl/prod/database-url --value "..." --type SecureString
aws ssm put-parameter --name /vsl/prod/redis-url --value "..." --type SecureString
```

## Cost Optimization

**Estimated Monthly Costs (1000 generations/day)**:

- Lambda: ~$10-15
- DynamoDB: ~$5 (on-demand)
- S3: ~$5 (standard storage)
- RDS (db.t3.micro): ~$15
- ElastiCache (cache.t3.micro): ~$15
- Data Transfer: ~$5
- **Total AWS**: ~$55-60/month

**Replicate costs**: Variable based on models used ($10-100/month)

## Next Steps

1. ✅ Set up monitoring and alerts
2. ✅ Configure backup policies for RDS
3. ✅ Implement CloudWatch alarms for critical metrics
4. ✅ Set up S3 lifecycle policies for cost optimization
5. ✅ Create CI/CD pipeline for automated deployments
6. ✅ Implement comprehensive testing suite
7. ✅ Add API authentication (API Gateway API keys or Cognito)
8. ✅ Set up multi-region deployment for high availability

## Support

For issues or questions:
- Check CloudWatch Logs for error details
- Review documentation in `/docs` directory
- Check Replicate API status: https://status.replicate.com
