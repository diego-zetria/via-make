# VSL Media Generation API Documentation

## Base URL
```
https://{api-id}.execute-api.us-east-1.amazonaws.com/homolog
```

## Authentication
Currently using API Gateway API keys. Add to request headers:
```
X-API-Key: your-api-key-here
```

---

## Endpoints

### 1. Generate Media
Create a new AI media generation job.

**Endpoint**: `POST /generate-media`

**Request Body**:
```json
{
  "userId": "user123",
  "mediaType": "video" | "image" | "audio",
  "modelId": "stability-video" | "flux-schnell" | "musicgen" | ...,
  "parameters": {
    // Model-specific parameters (see Models section)
  },
  "prompt": "Optional text prompt for certain models"
}
```

**Response** (202 Accepted):
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "estimatedTime": 60,
  "estimatedCost": 0.05,
  "replicateId": "abc123",
  "message": "Media generation started"
}
```

**Error Responses**:
- `400`: Invalid request parameters
- `429`: Rate limit exceeded
- `500`: Internal server error

**Example - Generate Image**:
```bash
curl -X POST https://xxx.execute-api.us-east-1.amazonaws.com/homolog/generate-media \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "userId": "user123",
    "mediaType": "image",
    "modelId": "flux-schnell",
    "parameters": {
      "prompt": "A futuristic cityscape at sunset",
      "width": 1024,
      "height": 1024
    }
  }'
```

**Example - Generate Video**:
```bash
curl -X POST https://xxx.execute-api.us-east-1.amazonaws.com/homolog/generate-media \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "userId": "user123",
    "mediaType": "video",
    "modelId": "stability-video",
    "parameters": {
      "image": "https://example.com/input-image.jpg",
      "motion_bucket_id": 127,
      "fps": 24,
      "num_frames": 25
    }
  }'
```

**Example - Generate Audio**:
```bash
curl -X POST https://xxx.execute-api.us-east-1.amazonaws.com/homolog/generate-media \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key" \
  -d '{
    "userId": "user123",
    "mediaType": "audio",
    "modelId": "musicgen",
    "parameters": {
      "prompt": "Epic orchestral music with drums",
      "duration": 8
    }
  }'
```

---

### 2. Get Job Status
Check the status of a media generation job.

**Endpoint**: `GET /status/{jobId}`

**Path Parameters**:
- `jobId` (required): The job ID returned from generate-media

**Response** (200 OK):
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "completed" | "processing" | "pending" | "failed" | "cancelled",
  "mediaType": "video",
  "modelId": "stability-video",
  "userId": "user123",
  "createdAt": "2025-10-18T10:30:00Z",
  "completedAt": "2025-10-18T10:31:15Z",
  "processingTime": 75,
  "result": {
    "originalUrl": "https://vsl-homolog-media.s3.amazonaws.com/videos/user123/2025/10/18/jobId/original.mp4",
    "thumbnailUrl": "https://vsl-homolog-media.s3.amazonaws.com/videos/user123/2025/10/18/jobId/thumbnail.jpg",
    "s3Path": "videos/user123/2025/10/18/jobId",
    "fileSize": 15728640,
    "duration": 5,
    "width": 1024,
    "height": 576,
    "fps": 24
  }
}
```

**Status Values**:
- `pending`: Job created, waiting to start
- `processing`: AI generation in progress
- `completed`: Media generated successfully
- `failed`: Generation failed (see error field)
- `cancelled`: Job was cancelled

**Error Response** (when failed):
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "failed",
  "error": "Error message from Replicate API",
  "createdAt": "2025-10-18T10:30:00Z",
  "completedAt": "2025-10-18T10:30:45Z"
}
```

**Example**:
```bash
curl https://xxx.execute-api.us-east-1.amazonaws.com/homolog/status/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-API-Key: your-key"
```

---

### 3. Webhook (Internal)
Receives callbacks from Replicate API. Not called directly by clients.

**Endpoint**: `POST /webhook/replicate`

**Request Body** (from Replicate):
```json
{
  "id": "replicate-prediction-id",
  "status": "succeeded" | "failed" | "cancelled",
  "output": ["https://replicate.delivery/output-url"],
  "error": null | "error message",
  "metrics": {
    "predict_time": 12.34
  }
}
```

**Response**: `200 OK`

---

## Available Models

### Video Models

#### stability-video
Generate video from a single image using Stable Video Diffusion.

**Model ID**: `stability-video`
**Pricing**: $0.05 per generation
**Est. Time**: 60 seconds

**Parameters**:
```json
{
  "image": "https://url-to-input-image.jpg",  // Required
  "motion_bucket_id": 127,                     // Optional, default: 127, range: 1-255
  "fps": 24,                                   // Optional, default: 24, range: 5-30
  "num_frames": 25                             // Optional, default: 25, range: 14-25
}
```

---

### Image Models

#### flux-schnell
Fast image generation with good quality from Black Forest Labs.

**Model ID**: `flux-schnell`
**Pricing**: $0.003 per image
**Est. Time**: 5 seconds

**Parameters**:
```json
{
  "prompt": "A detailed description of the image",  // Required
  "width": 1024,                                    // Optional, default: 1024
  "height": 1024,                                   // Optional, default: 1024
  "num_outputs": 1                                  // Optional, default: 1, max: 4
}
```

#### sdxl
High-quality image generation with Stable Diffusion XL.

**Model ID**: `sdxl`
**Pricing**: $0.01 per image
**Est. Time**: 10 seconds

**Parameters**:
```json
{
  "prompt": "A detailed description",               // Required
  "negative_prompt": "What to avoid in the image",  // Optional
  "width": 1024,                                    // Optional, default: 1024
  "height": 1024,                                   // Optional, default: 1024
  "num_inference_steps": 50,                        // Optional, default: 50
  "guidance_scale": 7.5                             // Optional, default: 7.5
}
```

---

### Audio Models

#### musicgen
Generate music from text prompts using Meta's MusicGen.

**Model ID**: `musicgen`
**Pricing**: $0.02 per generation
**Est. Time**: 30 seconds

**Parameters**:
```json
{
  "prompt": "Epic orchestral music with drums",  // Required
  "duration": 8,                                 // Optional, default: 8, max: 30
  "temperature": 1.0,                            // Optional, default: 1.0, range: 0-2
  "top_k": 250,                                  // Optional, default: 250
  "top_p": 0.0                                   // Optional, default: 0.0, range: 0-1
}
```

---

## Rate Limiting

**Per User Limits**:
- 100 requests per hour
- 1000 requests per day

**Response Headers**:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1634567890
```

**Rate Limit Exceeded** (429):
```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 3600
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid parameters |
| 401 | Unauthorized - Invalid or missing API key |
| 404 | Not Found - Job ID not found |
| 429 | Too Many Requests - Rate limit exceeded |
| 500 | Internal Server Error |
| 502 | Bad Gateway - Replicate API error |
| 503 | Service Unavailable - Temporary outage |

**Error Response Format**:
```json
{
  "error": "Error description",
  "details": "Additional error details",
  "code": "ERROR_CODE"
}
```

---

## Webhooks (For Your Application)

You can optionally configure webhooks to receive notifications when jobs complete.

**Webhook Payload** (sent to your endpoint):
```json
{
  "event": "job.completed" | "job.failed",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "user123",
  "status": "completed",
  "result": {
    "originalUrl": "...",
    "thumbnailUrl": "...",
    "fileSize": 15728640
  },
  "timestamp": "2025-10-18T10:31:15Z"
}
```

Configure webhook URL via environment variable or API (future feature).

---

## Best Practices

### 1. Polling for Status
```javascript
async function waitForCompletion(jobId, maxWaitTime = 300000) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const response = await fetch(`${baseUrl}/status/${jobId}`);
    const status = await response.json();

    if (status.status === 'completed') {
      return status.result;
    } else if (status.status === 'failed') {
      throw new Error(status.error);
    }

    // Poll every 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error('Timeout waiting for job completion');
}
```

### 2. Error Handling
```javascript
try {
  const response = await generateMedia(params);
  const result = await waitForCompletion(response.jobId);
  console.log('Generated media:', result.originalUrl);
} catch (error) {
  if (error.status === 429) {
    // Rate limited - wait and retry
    await new Promise(resolve => setTimeout(resolve, error.retryAfter * 1000));
    return retry();
  } else if (error.status >= 500) {
    // Server error - retry with exponential backoff
    return retryWithBackoff();
  } else {
    // Client error - log and fail
    console.error('Generation failed:', error);
  }
}
```

### 3. Optimizing Costs
- Cache results for duplicate prompts
- Use faster models (flux-schnell) for prototyping
- Batch similar requests
- Set appropriate timeouts

---

## SDK Examples

### JavaScript/Node.js
```javascript
const VSLClient = require('./vsl-client');

const client = new VSLClient({
  apiKey: process.env.VSL_API_KEY,
  baseUrl: 'https://xxx.execute-api.us-east-1.amazonaws.com/homolog'
});

// Generate image
const job = await client.generateImage({
  prompt: 'A beautiful sunset',
  modelId: 'flux-schnell'
});

// Wait for completion
const result = await client.waitForCompletion(job.jobId);
console.log('Image URL:', result.originalUrl);
```

### Python
```python
import vsl

client = vsl.Client(
    api_key=os.getenv('VSL_API_KEY'),
    base_url='https://xxx.execute-api.us-east-1.amazonaws.com/homolog'
)

# Generate video
job = client.generate_video(
    image_url='https://example.com/input.jpg',
    model_id='stability-video'
)

# Wait for completion
result = client.wait_for_completion(job['jobId'])
print(f"Video URL: {result['originalUrl']}")
```

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/vsl/issues
- Email: support@yourcompany.com
- Documentation: https://docs.yourcompany.com/vsl
