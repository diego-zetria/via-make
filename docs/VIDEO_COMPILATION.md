# Video Compilation System

Sistema de compilação de vídeos usando FFmpeg em AWS Lambda para concatenar múltiplos vídeos aprovados em um vídeo final.

## 🎯 Overview

O sistema de compilação de vídeos permite:
- **Aprovação de vídeos**: Workflow para revisar e aprovar vídeos gerados pela IA
- **Compilação serverless**: FFmpeg rodando em Lambda para concatenar vídeos
- **Armazenamento S3**: Vídeos compilados salvos permanentemente no S3
- **Download direto**: Interface para baixar vídeos compilados

## 🏗️ Arquitetura

```
Frontend (Next.js)
    ↓
Backend (Express/Prisma)
    ↓
Lambda compile-videos
    ↓
    ├─→ Download videos from S3
    ├─→ FFmpeg concat (no re-encoding)
    ├─→ Upload compiled video to S3
    └─→ Update database with compiled URL
```

## 📋 Workflow Completo

### 1. Geração de Vídeos
```
User → Frontend → Backend → Lambda generate-media → Replicate API
                                        ↓
                                   Webhook Lambda → S3 Upload
                                        ↓
                                   Backend notification
                                        ↓
                                   Frontend update
```

### 2. Aprovação de Vídeos
```sql
-- Status workflow: pending → generating → completed → approved
UPDATE vsl_frontend.section_videos
SET status = 'approved'
WHERE id = $videoId AND status = 'completed'
```

**Backend endpoint**: `POST /api/section-videos/:videoId/approve`

### 3. Compilação
```
Backend /api/scripts/:scriptId/compile
    ↓
Lambda /compile-videos
    ↓
    ├─ Download 3 videos from S3 (parallel)
    ├─ Create filelist.txt
    ├─ FFmpeg concat demuxer (-c copy, no re-encoding)
    ├─ Upload to S3
    └─ Update database
```

**Database update**:
```sql
UPDATE vsl_frontend.section_detailed_scripts
SET compiled_video_url = $url,
    compiled_at = NOW(),
    updated_at = NOW()
WHERE id = $scriptId
```

## 🔧 Lambda Configuration

### Resources
- **Memory**: 3008 MB (máximo para melhor performance)
- **Timeout**: 600s (10 minutos)
- **Ephemeral Storage**: 2048 MB (para armazenar vídeos temporariamente)
- **FFmpeg Layer**: `arn:aws:lambda:us-east-1:727646477615:layer:ffmpeg:1`

### Environment Variables
```yaml
DATABASE_URL: ${ssm:/vsl/database-url}
S3_BUCKET: vsl-homolog-media
STAGE: homolog
AWS_REGION: us-east-1
```

### IAM Permissions
```yaml
- s3:GetObject       # Download videos
- s3:PutObject       # Upload compiled video
- s3:PutObjectAcl    # Set permissions
- ssm:GetParameter   # Get database URL
- ec2:*              # VPC networking
```

## 📦 FFmpeg Layer

### Deployment
O layer FFmpeg foi deployado através do AWS Serverless Application Repository:

```bash
# 1. Create CloudFormation change set
aws serverlessrepo create-cloud-formation-change-set \
  --application-id arn:aws:serverlessrepo:us-east-1:145266761615:applications/ffmpeg-lambda-layer \
  --stack-name ffmpeg-lambda-layer \
  --capabilities CAPABILITY_IAM

# 2. Execute change set
aws cloudformation execute-change-set \
  --change-set-name <change-set-name>

# 3. Get layer ARN
aws lambda list-layer-versions --layer-name ffmpeg
```

**Layer ARN**: `arn:aws:lambda:us-east-1:727646477615:layer:ffmpeg:1`

**Binary location**: `/opt/bin/ffmpeg` (available in Lambda runtime)

## 🎬 FFmpeg Usage

### Concat Demuxer (No Re-encoding)
```bash
# Create filelist.txt
cat > /tmp/filelist.txt << EOF
file '/tmp/video-1.mp4'
file '/tmp/video-2.mp4'
file '/tmp/video-3.mp4'
EOF

# Concatenate using copy codec (fast, no quality loss)
/opt/bin/ffmpeg \
  -f concat \
  -safe 0 \
  -i /tmp/filelist.txt \
  -c copy \
  /tmp/compiled.mp4
```

**Vantagens**:
- ⚡ **Rápido**: ~300ms para 3 vídeos (6.75MB)
- 🎯 **Sem perda de qualidade**: Apenas copia streams, não re-codifica
- 💰 **Eficiente**: Baixo uso de CPU e tempo de execução

## 📊 Performance Metrics

### Exemplo Real
```json
{
  "jobId": "compile-67890-1234567890",
  "scriptId": 67890,
  "videoCount": 3,
  "totalSize": "6.75MB",
  "duration": "0.55s",
  "breakdown": {
    "download": "0.20s",
    "ffmpeg": "0.30s",
    "upload": "0.05s"
  }
}
```

### Estimativas por Tamanho
| Videos | Total Size | Download | FFmpeg | Upload | Total |
|--------|-----------|----------|--------|--------|-------|
| 3      | ~7MB      | 0.2s     | 0.3s   | 0.05s  | 0.55s |
| 5      | ~12MB     | 0.4s     | 0.5s   | 0.10s  | 1.0s  |
| 10     | ~25MB     | 0.8s     | 1.0s   | 0.20s  | 2.0s  |

## 🔍 Troubleshooting

### Error: "uploadBuffer is not a function"
**Causa**: Método `uploadBuffer()` não existe no s3Manager

**Solução**: Usar `uploadFile()` com caminho do arquivo
```javascript
// ❌ Errado
await s3Manager.uploadBuffer({ buffer, key });

// ✅ Correto
await s3Manager.uploadFile({ filePath, userId, mediaType });
```

### Error: "Table 'scripts' does not exist"
**Causa**: Nome da tabela incorreto

**Solução**: Usar `section_detailed_scripts`
```sql
-- ❌ Errado
UPDATE vsl_frontend.scripts SET ...

-- ✅ Correto
UPDATE vsl_frontend.section_detailed_scripts SET ...
```

### Error: "Column 'compiled_video_url' does not exist"
**Causa**: Colunas faltando no schema

**Solução**: Adicionar colunas
```sql
ALTER TABLE vsl_frontend.section_detailed_scripts
ADD COLUMN IF NOT EXISTS compiled_video_url TEXT,
ADD COLUMN IF NOT EXISTS compiled_at TIMESTAMP(3);
```

### Error: FFmpeg Layer Access Denied
**Causa**: Tentando usar layer de outra conta AWS

**Solução**: Deploy próprio layer via SAR
```bash
aws serverlessrepo create-cloud-formation-change-set \
  --application-id arn:aws:serverlessrepo:us-east-1:145266761615:applications/ffmpeg-lambda-layer \
  --stack-name ffmpeg-lambda-layer
```

## 💡 Frontend Integration

### Download Button with Blob API
```typescript
const downloadVideo = async (url: string) => {
  try {
    setDownloading(true);

    // Fetch video from S3
    const response = await fetch(url);
    const blob = await response.blob();

    // Create blob URL and download
    const blobUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = url.split('/').pop() || 'video-compilado.mp4';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Cleanup
    window.URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Download error:', err);
  } finally {
    setDownloading(false);
  }
};
```

**Motivo**: Atributo `download` não funciona para cross-origin URLs (S3)

## 📝 Database Schema

### section_videos
```sql
CREATE TABLE vsl_frontend.section_videos (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL,
  script_id INTEGER,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,  -- 'pending', 'generating', 'completed', 'approved', 'failed'
  result_url TEXT,       -- S3 URL (permanent)
  thumbnail_url TEXT,
  replicate_job_id TEXT,
  error_message TEXT,
  processing_time INTEGER,
  actual_cost DECIMAL(10, 4),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### section_detailed_scripts
```sql
CREATE TABLE vsl_frontend.section_detailed_scripts (
  id SERIAL PRIMARY KEY,
  section_id INTEGER NOT NULL,
  script_content TEXT,
  compiled_video_url TEXT,      -- NEW: URL do vídeo compilado
  compiled_at TIMESTAMP(3),     -- NEW: Timestamp da compilação
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## 🚀 Deployment

### Deploy Lambda Functions
```bash
# Set AWS profile
export AWS_PROFILE=cloudville

# Deploy all functions
serverless deploy --verbose

# Deploy only compile-videos function (faster)
serverless deploy function -f compileVideos
```

### Update Database Schema
```bash
# Connect to PostgreSQL
PGPASSWORD="..." psql -h staging-shopify.cra22aoqsnp8.us-east-1.rds.amazonaws.com -U master -d chatbot

# Add columns
ALTER TABLE vsl_frontend.section_detailed_scripts
ADD COLUMN IF NOT EXISTS compiled_video_url TEXT,
ADD COLUMN IF NOT EXISTS compiled_at TIMESTAMP(3);
```

### Test Compilation
```bash
# 1. Generate videos and approve them in frontend
# 2. Click "Compilar Vídeos" button
# 3. Check CloudWatch Logs
aws logs tail /aws/lambda/vsl-homolog-compileVideos --follow

# 4. Verify in database
SELECT id, compiled_video_url, compiled_at
FROM vsl_frontend.section_detailed_scripts
WHERE compiled_video_url IS NOT NULL;
```

## 📖 API Reference

### POST /api/scripts/:scriptId/compile
Compila múltiplos vídeos aprovados em um único vídeo final.

**Request**:
```json
{
  "outputFormat": "mp4",
  "quality": "high"
}
```

**Response**:
```json
{
  "success": true,
  "message": "Video compilation completed",
  "data": {
    "scriptId": 67890,
    "videoCount": 3,
    "totalDuration": 45,
    "compiledVideoUrl": "https://vsl-homolog-media.s3.amazonaws.com/compiled/...",
    "fileSize": 7085456,
    "jobId": "compile-67890-1234567890",
    "duration": 550
  }
}
```

### POST /api/section-videos/:videoId/approve
Aprova um vídeo gerado para posterior compilação.

**Response**:
```json
{
  "success": true,
  "message": "Video approved successfully",
  "data": {
    "videoId": "123",
    "status": "approved"
  }
}
```

## 🔒 Security

### S3 Permissions
- Videos são públicos para leitura (necessário para frontend)
- Upload requer autenticação AWS
- CORS habilitado para download cross-origin

### Lambda Security
- Rodando em VPC privada
- Secrets no SSM Parameter Store
- IAM com permissões mínimas necessárias

## 💰 Cost Analysis

### Por Compilação
- **Lambda execution**: $0.000001667/100ms × 550ms = ~$0.00001
- **S3 GET**: $0.0004/1000 × 3 videos = ~$0.000001
- **S3 PUT**: $0.005/1000 × 1 video = ~$0.000005
- **Data transfer**: Desprezível (within region)

**Total**: ~$0.000016 por compilação

### Estimativa Mensal
- 1000 compilações/mês: **~$0.02/mês**
- 10000 compilações/mês: **~$0.20/mês**

**Conclusão**: Sistema extremamente econômico! 💰

## 📈 Future Improvements

- [ ] Suporte a transitions entre vídeos
- [ ] Adicionar música de fundo
- [ ] Overlay de texto/legendas
- [ ] Múltiplos formatos de saída (WebM, AVI)
- [ ] Compressão/otimização de tamanho
- [ ] Preview antes da compilação final
- [ ] Paralelização de downloads (Promise.all)
- [ ] Cache de vídeos já baixados
- [ ] Retry logic com exponential backoff
- [ ] Webhooks para notificar compilação completa

## 🤝 Contributing

Para adicionar novos recursos ao sistema de compilação:
1. Teste localmente com FFmpeg
2. Adicione ao Lambda handler
3. Atualize testes
4. Deploy em staging primeiro
5. Monitore CloudWatch Logs
6. Deploy em produção

---

**Made with ❤️ using FFmpeg, AWS Lambda, and lots of ☕**
