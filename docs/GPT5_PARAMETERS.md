# GPT-5 Model Parameters Reference

**Model Type:** Reasoning Model
**Last Updated:** 2025-10-18

---

## ⚠️ Critical Information

GPT-5 is a **reasoning model** with **very limited parameter support** compared to GPT-4/GPT-4o.

**Why?** GPT-5 uses internal chain-of-thought reasoning with multiple rounds of generation, verification, and selection. External sampling parameters would break these calibrations.

---

## ❌ Unsupported Parameters

These parameters will cause **400 Bad Request** errors:

- ❌ `temperature` - Only default (1) is supported, better to omit entirely
- ❌ `top_p` - Not supported
- ❌ `presence_penalty` - Not supported
- ❌ `frequency_penalty` - Not supported
- ❌ `logprobs` - Not supported
- ❌ `top_logprobs` - Not supported
- ❌ `logit_bias` - Not supported
- ❌ `max_tokens` - Use `max_completion_tokens` instead

---

## ✅ Supported Parameters

### Required/Common Parameters

```typescript
{
  model: "gpt-5" | "gpt-5-mini" | "gpt-5-nano" | "gpt-5-chat",
  messages: [...],
  max_completion_tokens: number  // Replaces max_tokens
}
```

### Optional Parameters

#### `reasoning_effort`
Controls the computational effort for reasoning.

**Values:**
- `"minimal"` - Fastest, less reasoning (GPT-5 only)
- `"low"` - Basic reasoning
- `"medium"` - Moderate reasoning (default)
- `"high"` - Deep reasoning, slower

**Example:**
```typescript
{
  model: "gpt-5",
  messages: [...],
  max_completion_tokens: 1000,
  reasoning_effort: "medium"
}
```

#### `verbosity`
Controls the length of the output.

**Values:**
- `"low"` - Concise responses
- Default (omitted) - Normal verbosity

**Example:**
```typescript
{
  model: "gpt-5",
  messages: [...],
  max_completion_tokens: 1000,
  verbosity: "low"
}
```

---

## 🔧 Migration from GPT-4/GPT-4o

### Before (GPT-4)
```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [...],
  max_tokens: 500,
  temperature: 0.7,
  top_p: 0.9,
  presence_penalty: 0.5,
  frequency_penalty: 0.3,
});
```

### After (GPT-5)
```typescript
const response = await openai.chat.completions.create({
  model: "gpt-5",
  messages: [...],
  max_completion_tokens: 500,
  reasoning_effort: "medium",  // Optional
  // No temperature, top_p, penalties, etc.
});
```

---

## 💡 Best Practices

### 1. Use High `max_completion_tokens`
Internal reasoning uses tokens from this budget. Set high values (10000-20000) or omit to avoid premature cutoff.

```typescript
{
  model: "gpt-5",
  messages: [...],
  max_completion_tokens: 20000  // Generous for reasoning
}
```

### 2. Control Reasoning Effort
For different use cases:

- **Quick responses:** `reasoning_effort: "minimal"`
- **Complex problems:** `reasoning_effort: "high"`
- **Balanced:** Omit (uses default)

### 3. Error Handling
Always handle the specific GPT-5 errors:

```typescript
try {
  const response = await openai.chat.completions.create({...});
} catch (error: any) {
  if (error.status === 400) {
    if (error.message.includes('Unsupported parameter')) {
      // Handle unsupported parameter error
      console.error('Using unsupported GPT-5 parameter:', error.message);
    }
  }
}
```

---

## 📊 Model Variants

| Model | Description | Reasoning Effort Support |
|-------|-------------|-------------------------|
| `gpt-5` | Full GPT-5 | minimal, low, medium, high |
| `gpt-5-mini` | Smaller, faster | minimal, low, medium, high |
| `gpt-5-nano` | Smallest | minimal, low, medium, high |
| `gpt-5-chat` | Chat-optimized | minimal, low, medium, high |

---

## 🚨 Common Errors

### Error: "Unsupported parameter: 'temperature'"
```
❌ max_tokens is not supported with this model
```
**Fix:** Use `max_completion_tokens` instead

### Error: "Unsupported value: 'temperature'"
```
❌ 'temperature' does not support 0.3 with this model.
   Only the default (1) value is supported.
```
**Fix:** Remove `temperature` parameter completely

### Error: "Unsupported parameter: 'top_p'"
```
❌ 'top_p' is not supported with this model
```
**Fix:** Remove `top_p` parameter completely

---

## 📚 References

- [OpenAI Platform Docs - GPT-5](https://platform.openai.com/docs/models/gpt-5)
- [Azure OpenAI Reasoning Models](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/reasoning)
- [Why You Can't Set Temperature on GPT-5](https://hippocampus-garden.com/llm_temperature/)

---

## 🎯 VSL Project Usage

### Agent 1: Script Writer (Temperature: N/A)
```typescript
const response = await openai.chat.completions.create({
  model: "gpt-5",
  messages: [...],
  max_completion_tokens: 2000,
  reasoning_effort: "medium",  // Creative but controlled
});
```

### Agent 2: System Integrator (Temperature: N/A)
```typescript
const response = await openai.chat.completions.create({
  model: "gpt-5",
  messages: [...],
  max_completion_tokens: 1000,
  reasoning_effort: "low",  // Precise, fast
});
```

### Agent 3: Fallback Handler (Temperature: N/A)
```typescript
const response = await openai.chat.completions.create({
  model: "gpt-5",
  messages: [...],
  max_completion_tokens: 1500,
  reasoning_effort: "medium",  // Balanced
});
```

---

**Note:** Since GPT-5 doesn't support temperature, we use `reasoning_effort` to control the trade-off between speed and reasoning depth for each agent's specific needs.

**Last Updated:** 2025-10-18
