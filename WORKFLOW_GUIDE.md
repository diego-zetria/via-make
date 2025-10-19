# Guia de Workflow: Sistema VSL com Lambda IA

## 🎯 Visão Geral

Este sistema permite criar VSLs (Video Sales Letters) profissionais com geração automática de vídeos usando IA. O workflow completo inclui:

1. **Criação do Roteiro** - Escrever as seções do VSL com sugestões de IA (GPT-5)
2. **Configuração Lambda** - Configurar parâmetros de geração de mídia com sugestões inteligentes
3. **Geração de Vídeos** - Gerar vídeos profissionais para cada seção do VSL

---

## 📋 Fluxo de Trabalho Completo

### Passo 1: Criar Projeto VSL

1. Acesse a página inicial
2. Selecione um template (PAS, AIDA, Story, ou Authority)
3. Preencha os dados do projeto:
   - Nome do projeto
   - Produto/Serviço
   - Público-alvo
   - Problema principal
   - Oferta/Preço
   - Tom do conteúdo

### Passo 2: Editar Roteiro (Aba "📝 Roteiro")

**O que você fez:** Gerou 3 seções do VSL com conteúdo persuasivo

**Recursos disponíveis:**
- **Editor de Texto** - Escreva ou edite o conteúdo manualmente
- **✨ Sugestão da IA** - Clique para gerar conteúdo automaticamente usando GPT-5
- **Score de Persuasão** - Veja a pontuação de persuasão do seu conteúdo (0-100)
- **Navegação entre Seções** - Use os botões de navegação inferior
- **💾 Salvar** - Salve todas as alterações no banco de dados

**Dica:** Use a sugestão da IA e depois edite para personalizar com seu toque único.

---

### Passo 3: Configurar Lambda (Aba "⚙️ Configuração Lambda")

**Agora você precisa fazer isto!**

A configuração Lambda define como os vídeos serão gerados. A IA analisa seu conteúdo VSL e sugere os melhores parâmetros.

#### 3.1. Selecione o Tipo de Mídia

Escolha entre:
- 🎥 **Vídeo** - Gerar vídeos com IA (recomendado para VSL)
- 🖼️ **Imagem** - Gerar imagens estáticas
- 🎵 **Áudio** - Gerar narração ou música

#### 3.2. Configure o Contexto

**Orçamento:**
- **Baixo** - Modelos mais econômicos (Ex: `wan-2.5-fast`, `flux-schnell`)
- **Médio** - Equilíbrio entre custo e qualidade
- **Alto** - Máxima qualidade (Ex: `veo-3.1`, `stability-video`)

**Prioridade:**
- 💰 **Custo** - Minimizar gastos
- ⚖️ **Equilibrado** - Melhor relação custo/benefício
- ✨ **Qualidade** - Máxima qualidade visual

**Tom do Conteúdo:**
- Profissional, Casual, Enérgico, ou Elegante

#### 3.3. Obter Sugestão IA

Clique em **✨ Obter Sugestão IA** e aguarde (5-10 segundos).

**O GPT-5 LambdaConfigAgent irá:**
1. Analisar todo o conteúdo do seu VSL
2. Considerar seu público-alvo, orçamento e prioridades
3. Sugerir o modelo ideal de IA para vídeo
4. Recomendar os parâmetros perfeitos (resolução, duração, aspect ratio, etc.)
5. Calcular custo e tempo estimados
6. Apresentar alternativas com comparação de custos

**Exemplo de Sugestão:**
```
🤖 Modelo Recomendado: wan-2.5-t2v

"Com base no conteúdo persuasivo do seu VSL voltado para empreendedores,
recomendo o modelo Wanxiang 2.5 que oferece excelente qualidade visual
para apresentações profissionais. O orçamento médio e prioridade
equilibrada justificam este modelo intermediário."

Custo Estimado: $0.40
Tempo Estimado: 30s

Parâmetros Sugeridos:
- duration: 8 segundos
- resolution: 720p
- aspect_ratio: 16:9
- fps: 24

💡 Recomendações:
• Use 16:9 para compatibilidade com YouTube e redes sociais
• 8 segundos é ideal para manter atenção sem perder qualidade
• 720p oferece boa qualidade com custo razoável
```

#### 3.4. Salvar Configuração

Clique em **💾 Salvar Configuração**

O sistema irá:
- Salvar a configuração no banco de dados
- Marcar como configuração padrão
- Redirecionar automaticamente para a aba "🎬 Gerar Vídeos"

---

### Passo 4: Gerar Vídeos (Aba "🎬 Gerar Vídeos")

**Finalmente, gerar os vídeos!**

#### 4.1. Revisar Configuração

No painel superior, você verá:
- **Configuração ativa** (selecionada automaticamente)
- **Modelo**: qual IA será usada
- **Custo Estimado** por vídeo
- **Tempo Estimado** de processamento

#### 4.2. Gerar Vídeos

**Opção 1: Gerar Todos os Vídeos** (Recomendado)
- Clique em **🎬 Gerar Todos os Vídeos**
- O sistema irá criar jobs para TODAS as seções do VSL
- Processamento paralelo (economiza tempo)

**Opção 2: Gerar Vídeo Individual**
- Encontre a seção desejada
- Clique no botão **🎥 Gerar Vídeo** da seção

#### 4.3. Monitorar Progresso

O sistema atualiza o status automaticamente a cada 5 segundos:

**Status Possíveis:**
- ⏳ **Pendente** - Job criado, aguardando processamento
- 🔄 **Processando** - IA gerando o vídeo agora
- ✅ **Concluído** - Vídeo pronto! Botão de download aparece
- ❌ **Erro** - Algo deu errado, tente novamente

#### 4.4. Download dos Vídeos

Quando o status ficar **✅ Concluído**:
1. Clique no botão **📥 Download Vídeo**
2. O vídeo será baixado do S3
3. Salve localmente e use no seu VSL

#### 4.5. Resumo dos Jobs

No final da página, você verá:
- **Total** de jobs criados
- **Concluídos** com sucesso
- **Processando** no momento
- **Custo Total** acumulado

---

## 🎓 Exemplo Prático Completo

### Cenário: VSL para Curso Online de Marketing

**1. Roteiro (3 seções geradas):**
- **Problem** - "Você investe em tráfego mas não vende..."
- **Agitate** - "A cada dia que passa, dinheiro escorrendo pelo ralo..."
- **Solution** - "Método X que já ajudou 1.000+ empreendedores..."

**2. Configuração Lambda:**
- Tipo: 🎥 Vídeo
- Orçamento: Médio
- Prioridade: Equilibrado
- Tom: Profissional

**3. Sugestão IA:**
- Modelo recomendado: `wan-2.5-t2v`
- Custo: $0.40 por vídeo x 3 seções = **$1.20 total**
- Tempo: 30s por vídeo

**4. Geração:**
- ✅ Problem.mp4 - Concluído em 28s
- ✅ Agitate.mp4 - Concluído em 32s
- ✅ Solution.mp4 - Concluído em 30s

**5. Resultado:**
- 3 vídeos profissionais prontos para usar
- Tempo total: ~90 segundos
- Custo total: $1.20

---

## 🚀 Modelos de IA Disponíveis

### Vídeo
1. **stability-video** - Stable Diffusion Video (Alta qualidade, $0.20/job)
2. **wan-2.5-t2v** - Wanxiang 2.5 Text-to-Video (Equilibrado, $0.40/job)
3. **wan-2.5-fast** - Wanxiang Fast (Rápido, $0.30/job)
4. **veo-3.1** - Google Veo 3.1 (Premium, resolução customizável)
5. **veo-3.1-fast** - Google Veo Fast (Premium rápido)

### Imagem
1. **flux-schnell** - Flux Schnell (Rápido, $0.03/imagem)
2. **sdxl** - Stable Diffusion XL (Clássico, $0.02/imagem)
3. **nano-banana** - Nano Stable Diffusion (Ultra-rápido, $0.01/imagem)

### Áudio
1. **musicgen** - Meta MusicGen (Geração musical, $0.001/segundo)

---

## 💡 Dicas e Melhores Práticas

### Roteiro
✅ **Faça:** Use a sugestão da IA como base e personalize
✅ **Faça:** Mantenha seções entre 50-200 palavras
❌ **Evite:** Copiar e colar diretamente sem revisar

### Configuração Lambda
✅ **Faça:** Deixe a IA analisar seu conteúdo completo
✅ **Faça:** Considere seu orçamento total (número de seções x custo)
✅ **Faça:** Use 16:9 para compatibilidade máxima
❌ **Evite:** Escolher qualidade máxima se orçamento é limitado

### Geração de Vídeos
✅ **Faça:** Gere todos os vídeos de uma vez (mais eficiente)
✅ **Faça:** Aguarde conclusão antes de fazer alterações
❌ **Evite:** Gerar múltiplas versões do mesmo vídeo (desperdício)

---

## 🔧 Troubleshooting

### "Erro ao obter sugestão"
- Verifique se o backend está rodando (`npm run dev` no `/backend`)
- Confirme que `OPENAI_API_KEY` está configurada no `.env`

### "Job ficou pendente por muito tempo"
- Verifique logs do Lambda no CloudWatch
- Confirme que o webhook está configurado
- Tente criar novamente o job

### "Vídeo gerado mas não baixa"
- Verifique se o S3 bucket tem permissões públicas
- Confirme que a URL do vídeo está correta no banco

---

## 📊 Arquitetura do Sistema

```
Frontend (Next.js) → Backend (Express) → GPT-5 Agents
                          ↓
                    Lambda Functions
                          ↓
                    Replicate API
                          ↓
                    S3 + PostgreSQL
```

**Agentes GPT-5:**
1. **ScriptWriterAgent** - Gera conteúdo persuasivo para seções
2. **VSLSpecialistAgent** - Analisa e pontua persuasão
3. **LambdaConfigAgent** - Sugere configurações ideais de mídia
4. **SystemIntegratorAgent** - Gerencia integração com Lambda
5. **FallbackHandlerAgent** - Tratamento de erros

---

## 🎉 Próximos Passos

Após gerar seus vídeos:

1. **Download** - Baixe todos os vídeos
2. **Edição** - Combine os vídeos em um editor (Premiere, Final Cut, etc.)
3. **Adicione** - Música de fundo, legendas, call-to-action
4. **Publique** - YouTube, Facebook, Instagram, Landing Pages

---

## 📞 Suporte

Se precisar de ajuda:
1. Verifique logs do backend e frontend
2. Consulte a documentação dos modelos em `/config/models.json`
3. Revise os endpoints da API em `/src/routes/lambda.routes.ts`

**Bom trabalho! 🚀**
