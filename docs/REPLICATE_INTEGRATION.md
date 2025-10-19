# Guia de Integração Replicate API - VSL System

**Baseado na documentação oficial da Replicate (outubro 2025)**

## 📋 Visão Geral

Este documento contém insights essenciais extraídos da documentação oficial da Replicate para otimizar nossa integração no sistema VSL.

## 🔑 Autenticação

### API Token
- **Formato**: String de 40 caracteres começando com `r8_`
- **Header**: `Authorization: Bearer $REPLICATE_API_TOKEN`
- **Storage**: AWS Secrets Manager (`/vsl/replicate-token`)

```javascript
const headers = {
  'Authorization': `Bearer ${process.env.REPLICATE_API_TOKEN}`,
  'Content-Type': 'application/json'
};
```

## 🚀 Criação de Predictions

### Endpoint Principal
```
POST https://api.replicate.com/v1/predictions
```

### Request Body Structure
```json
{
  "version": "model-version-id",
  "input": {
    "prompt": "texto do prompt",
    // parâmetros específicos do modelo
  },
  "webhook": "https://your-domain.com/webhook/replicate",
  "webhook_events_filter": ["start", "completed"]
}
```

### Response Structure
```json
{
  "id": "prediction-id",
  "version": "model-version-id",
  "status": "starting|processing|succeeded|failed|canceled",
  "input": { /* input original */ },
  "output": null, // ou array de URLs quando completo
  "error": null,  // ou mensagem de erro
  "logs": "",
  "metrics": {
    "predict_time": 12.34 // tempo em segundos
  },
  "created_at": "2025-10-18T10:00:00Z",
  "started_at": "2025-10-18T10:00:05Z",
  "completed_at": null,
  "urls": {
    "get": "https://api.replicate.com/v1/predictions/{id}",
    "cancel": "https://api.replicate.com/v1/predictions/{id}/cancel",
    "stream": "https://streaming.api.replicate.com/..." // se suportado
  }
}
```

## 🔔 Webhooks - Implementação Completa

### Eventos Disponíveis

| Evento | Descrição | Quando Usar |
|--------|-----------|-------------|
| `start` | Prediction iniciou processamento | Atualizar UI com "processing" |
| `output` | Output parcial disponível | Streaming de resultados |
| `logs` | Logs de execução | Debug e monitoramento |
| `completed` | Prediction finalizada | Download e salvamento de mídia |

### Webhook Payload Structure
```json
{
  "id": "gm3qorzdhgbfurvjtvhg6dckhu",
  "model": "replicate/hello-world",
  "version": "5c7d5dc6dd8bf75c1acaa8565735e7986bc5b66206b55cca93cb72c9bf15ccaa",
  "input": { "text": "Alice" },
  "output": "Hello Alice", // ou array de URLs
  "logs": "processing logs...",
  "error": null,
  "status": "succeeded",
  "created_at": "2023-09-08T16:19:34.765994657Z",
  "started_at": "2023-09-08T16:19:35.000000000Z",
  "completed_at": "2023-09-08T16:20:34.765994657Z",
  "metrics": {
    "predict_time": 59.0
  },
  "urls": {
    "web": "https://replicate.com/p/{id}",
    "get": "https://api.replicate.com/v1/predictions/{id}",
    "cancel": "https://api.replicate.com/v1/predictions/{id}/cancel"
  }
}
```

### 🔐 Webhook Signature Validation (CRÍTICO!)

**⚠️ IMPORTANTE**: Sempre validar webhooks para prevenir ataques!

#### 1. Obter Signing Secret
```bash
curl -s -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  https://api.replicate.com/v1/webhooks/default/secret
```

Response:
```json
{
  "key": "whsec_xxxxxxxxxxxxx"
}
```

#### 2. Validação de Webhook (Node.js)
```javascript
const crypto = require('crypto');

function validateWebhook(request, secret) {
  const webhookId = request.headers['webhook-id'];
  const webhookTimestamp = request.headers['webhook-timestamp'];
  const webhookSignature = request.headers['webhook-signature'];

  // Construir mensagem assinada
  const signedContent = `${webhookId}.${webhookTimestamp}.${request.body}`;

  // Calcular signature esperada
  const expectedSignature = crypto
    .createHmac('sha256', secret.split('_')[1]) // Remove 'whsec_' prefix
    .update(signedContent)
    .digest('base64');

  // Comparar signatures
  const signatures = webhookSignature.split(' ');
  for (const sig of signatures) {
    const [version, signature] = sig.split(',');
    if (version === 'v1' && signature === expectedSignature) {
      return true;
    }
  }

  return false;
}

// Uso no Lambda
exports.handler = async (event) => {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET;

  if (!validateWebhook(event, secret)) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Invalid webhook signature' })
    };
  }

  // Processar webhook válido
  const prediction = JSON.parse(event.body);
  // ...
};
```

#### 3. Headers de Webhook
```javascript
{
  'Webhook-Id': 'msg_xxxxx',
  'Webhook-Timestamp': '1234567890',
  'Webhook-Signature': 'v1,signature_base64'
}
```

### Webhook Best Practices

1. **Idempotência**: Sempre verificar se já processamos este webhook
```javascript
const webhookKey = `webhook:processed:${prediction.id}`;
const alreadyProcessed = await redis.get(webhookKey);

if (alreadyProcessed) {
  return { statusCode: 200, body: 'Already processed' };
}

// Processar webhook
// ...

// Marcar como processado
await redis.setEx(webhookKey, 7200, Date.now().toString());
```

2. **Resposta Rápida**: Retornar 200 OK rapidamente e processar em background
```javascript
// ❌ ERRADO - processar tudo de forma síncrona
await downloadMedia();
await uploadToS3();
await updateDatabases();
return { statusCode: 200 };

// ✅ CORRETO - retornar rápido e processar async
setImmediate(async () => {
  await downloadMedia();
  await uploadToS3();
  await updateDatabases();
});

return { statusCode: 200, body: 'Webhook received' };
```

3. **Retry Handling**: Replicate faz retry automático se não receber 2xx
```javascript
try {
  // processar webhook
  return { statusCode: 200 };
} catch (error) {
  // Erros temporários -> 500 (Replicate vai tentar novamente)
  if (isTemporaryError(error)) {
    return { statusCode: 500, body: 'Temporary error, please retry' };
  }

  // Erros permanentes -> 200 (evitar retries infinitos)
  console.error('Permanent error:', error);
  return { statusCode: 200, body: 'Error logged' };
}
```

## 📊 Status da Prediction

### Lifecycle
```
starting → processing → succeeded
                     ↘ failed
                     ↘ canceled
```

### Polling (Alternativa ao Webhook)
```javascript
async function waitForCompletion(predictionId, maxAttempts = 60) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      {
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
        }
      }
    );

    const prediction = await response.json();

    if (prediction.status === 'succeeded') {
      return prediction;
    } else if (prediction.status === 'failed') {
      throw new Error(prediction.error);
    } else if (prediction.status === 'canceled') {
      throw new Error('Prediction was canceled');
    }

    // Poll a cada 5 segundos
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  throw new Error('Timeout waiting for prediction');
}
```

**⚠️ Atenção**: Polling consome mais recursos e tem latência maior. **Use webhooks sempre que possível!**

## 🎯 Modelos Específicos

### Endpoint Alternativo (Modelos Oficiais)
```
POST /v1/models/{owner}/{name}/predictions
```

Exemplo:
```bash
curl https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions \
  -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "prompt": "A cat wearing a hat"
    }
  }'
```

### Header `Prefer: wait` (Síncrono)
```bash
curl -X POST \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Prefer: wait" \
  -d '{"version": "...", "input": {...}}' \
  https://api.replicate.com/v1/predictions
```

**⚠️ Limitação**: Máximo 60 segundos de espera. Para modelos lentos, use modo async + webhook.

## 🎬 Streaming (Para modelos que suportam)

### Estrutura de Streaming
```javascript
const prediction = await createPrediction({
  version: "...",
  input: { prompt: "..." },
  stream: true
});

// URL de streaming disponível
const streamUrl = prediction.urls.stream;

// Server-Sent Events (SSE)
const eventSource = new EventSource(streamUrl, {
  withCredentials: true
});

eventSource.addEventListener('output', (e) => {
  console.log('Partial output:', e.data);
});

eventSource.addEventListener('done', (e) => {
  console.log('Complete output:', JSON.parse(e.data));
  eventSource.close();
});

eventSource.addEventListener('error', (e) => {
  console.error('Stream error:', JSON.parse(e.data));
  eventSource.close();
});
```

**Nota**: Streaming é útil para LLMs (texto) mas não aplicável para geração de vídeo/imagem.

## ❌ Error Handling

### Estrutura de Erro
```json
{
  "id": "prediction-id",
  "status": "failed",
  "error": "Detailed error message from the model",
  "logs": "Model execution logs...",
  "completed_at": "2025-10-18T10:05:00Z"
}
```

### Tipos Comuns de Erros

| Error | Causa | Solução |
|-------|-------|---------|
| `Authentication failed` | Token inválido | Verificar REPLICATE_API_TOKEN |
| `Invalid input` | Parâmetros incorretos | Validar input conforme schema do modelo |
| `Model version not found` | Version ID errado | Verificar version na documentação do modelo |
| `Rate limit exceeded` | Muitas requests | Implementar backoff exponencial |
| `Insufficient credits` | Conta sem créditos | Adicionar créditos na conta |
| `Model error: ...` | Erro no modelo | Ver logs para debug |

### Retry Strategy
```javascript
async function createPredictionWithRetry(options, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(options)
      });

      if (response.ok) {
        return await response.json();
      }

      const error = await response.json();

      // Não fazer retry para erros de validação (4xx exceto 429)
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw new Error(error.detail || 'Validation error');
      }

      lastError = error;

      // Exponential backoff
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
    }
  }

  throw lastError;
}
```

## 📦 Output Files

### Estrutura de Output
```json
{
  "output": [
    "https://replicate.delivery/pbxt/xxxxx/out-0.png",
    "https://replicate.delivery/pbxt/xxxxx/out-1.png"
  ]
}
```

### Download de Arquivos
```javascript
async function downloadFile(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  return Buffer.from(buffer);
}

// Uso
const [imageUrl] = prediction.output;
const imageBuffer = await downloadFile(imageUrl);

// Upload para S3
await s3Client.send(new PutObjectCommand({
  Bucket: 'vsl-homolog-media',
  Key: `videos/${userId}/${jobId}/original.mp4`,
  Body: imageBuffer,
  ContentType: 'video/mp4'
}));
```

### URLs Temporárias
**⚠️ IMPORTANTE**: URLs de output da Replicate são temporárias!

- **Validade**: Geralmente 24-48 horas
- **Solução**: Sempre fazer download e armazenar no S3 imediatamente

```javascript
// ❌ ERRADO - armazenar URL da Replicate no banco
await db.updateJob(jobId, {
  mediaUrl: prediction.output[0] // URL vai expirar!
});

// ✅ CORRETO - download e upload para S3
const buffer = await downloadFile(prediction.output[0]);
const s3Url = await uploadToS3(buffer, s3Key);
await db.updateJob(jobId, {
  mediaUrl: s3Url // URL permanente
});
```

## 🔧 Cancelamento de Predictions

### Cancel Endpoint
```
POST /v1/predictions/{id}/cancel
```

### Implementação
```javascript
async function cancelPrediction(predictionId) {
  const response = await fetch(
    `https://api.replicate.com/v1/predictions/${predictionId}/cancel`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
      }
    }
  );

  if (!response.ok) {
    throw new Error('Failed to cancel prediction');
  }

  return await response.json();
}
```

## 📊 Métricas e Monitoramento

### Metrics no Response
```json
{
  "metrics": {
    "predict_time": 12.34 // segundos
  }
}
```

### Logs
```javascript
// Logs disponíveis em tempo real durante processamento
const prediction = await getPrediction(id);
console.log(prediction.logs);
```

## 🚀 Melhorias Recomendadas para VSL

### 1. Implementar Webhook Signature Validation
**Prioridade**: 🔴 CRÍTICA

```javascript
// handlers/lib/replicate.js
async function validateReplicateWebhook(event) {
  const secret = await getWebhookSecret(); // do Secrets Manager
  return validateWebhook(event, secret);
}
```

### 2. Suportar Múltiplos Eventos de Webhook
**Prioridade**: 🟡 MÉDIA

```javascript
const options = {
  version: modelVersion,
  input: params,
  webhook: webhookUrl,
  webhook_events_filter: ['start', 'completed'] // ao invés de só 'completed'
};

// No webhook handler
switch (prediction.status) {
  case 'starting':
    await updateStatus(jobId, 'processing');
    break;
  case 'succeeded':
    await downloadAndSave(prediction);
    break;
  case 'failed':
    await markAsFailed(jobId, prediction.error);
    break;
}
```

### 3. Implementar FileOutput Streaming (Futuro)
**Prioridade**: 🟢 BAIXA

Para arquivos muito grandes (>100MB), considerar streaming direto S3→Replicate.

### 4. Adicionar Rate Limit Handling
**Prioridade**: 🟡 MÉDIA

```javascript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || 60;
  await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
  return retry();
}
```

### 5. Melhorar Error Messages
**Prioridade**: 🟡 MÉDIA

```javascript
function formatReplicateError(error) {
  const errorMap = {
    'Authentication failed': 'Token de API inválido ou expirado',
    'Invalid input': 'Parâmetros de entrada inválidos',
    'Rate limit exceeded': 'Limite de requisições excedido'
  };

  return errorMap[error] || error;
}
```

## 📚 Referências Oficiais

- **API Reference**: https://replicate.com/docs/reference/http
- **Webhooks Guide**: https://replicate.com/docs/topics/webhooks
- **JavaScript Client**: https://github.com/replicate/replicate-javascript
- **Predictions**: https://replicate.com/docs/topics/predictions

## ⚡ Quick Reference

### Criar Prediction
```javascript
const prediction = await createPrediction({
  version: 'model-version-id',
  input: { prompt: '...' },
  webhook: webhookUrl,
  webhook_events_filter: ['completed']
});
```

### Webhook Handler
```javascript
exports.handler = async (event) => {
  // 1. Validar signature
  if (!validateWebhook(event, secret)) {
    return { statusCode: 401 };
  }

  // 2. Verificar duplicação
  if (await isProcessed(prediction.id)) {
    return { statusCode: 200 };
  }

  // 3. Processar
  await processWebhook(prediction);

  // 4. Marcar como processado
  await markAsProcessed(prediction.id);

  return { statusCode: 200 };
};
```

### Download + Upload
```javascript
const buffer = await downloadFile(prediction.output[0]);
const s3Url = await uploadToS3(buffer, key);
await updateDatabase(jobId, { mediaUrl: s3Url });
```

---

**Última atualização**: 18 de outubro de 2025
**Baseado em**: Replicate API v1 + JavaScript Client v1.0
