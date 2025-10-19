import OpenAI from 'openai';
import { logger } from '../../utils/logger.js';

interface GPT5TestResult {
  success: boolean;
  message: string;
  model?: string;
  response?: string;
}

export async function testGPT5Connection(): Promise<GPT5TestResult> {
  try {
    logger.info('🧪 Testing GPT-5 connection...');

    if (!process.env.OPENAI_API_KEY) {
      logger.error('❌ OPENAI_API_KEY not set in environment variables');
      return {
        success: false,
        message: 'Missing OPENAI_API_KEY environment variable',
      };
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const model = process.env.OPENAI_MODEL || 'gpt-5';

    if (!model.includes('gpt-5')) {
      logger.warn(`⚠️ Warning: Using model "${model}" - expected "gpt-5" or "gpt-5-mini"`);
    }

    // GPT-5 is a reasoning model and only supports specific parameters
    // Unsupported: temperature, top_p, presence_penalty, frequency_penalty, logprobs, max_tokens
    // Supported: max_completion_tokens, reasoning_effort
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'user',
          content: 'Hello! Please confirm you are GPT-5 and respond with: "GPT-5 connection successful"',
        },
      ],
      max_completion_tokens: 100,
      // reasoning_effort can be: "minimal", "low", "medium", "high"
      // Omitting for default behavior
    });

    const content = response.choices[0].message.content || '';
    logger.info(`✅ GPT-5 Response: ${content}`);

    return {
      success: true,
      message: 'GPT-5 connection successful',
      model: model,
      response: content,
    };
  } catch (error: any) {
    logger.error('❌ GPT-5 Connection Failed:', error.message);

    if (error.code === 'ENOTFOUND') {
      return {
        success: false,
        message: 'Network error: Unable to reach OpenAI API',
      };
    }

    if (error.status === 401) {
      return {
        success: false,
        message: 'Authentication error: Invalid or missing OPENAI_API_KEY',
      };
    }

    if (error.status === 404) {
      return {
        success: false,
        message: 'Model not found: GPT-5 model may not be available with your API key',
      };
    }

    return {
      success: false,
      message: error.message || 'Unknown error occurred',
    };
  }
}
