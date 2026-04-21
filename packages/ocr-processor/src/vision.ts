import OpenAI from 'openai';
import { IExtractionResult } from '@bookscanner/shared';

export class OpenAIVisionExtractor {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async extractBookData(
    imageBuffer: Buffer,
    prompt: string,
    mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  ): Promise<IExtractionResult> {
    const base64 = imageBuffer.toString('base64');

    const response = await this.client.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 1500,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(raw) as IExtractionResult;
  }
}

export class YandexVisionExtractor {
  private readonly client: OpenAI;
  private readonly modelUri: string;

  constructor(apiKey: string, folderId: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://llm.api.cloud.yandex.net/v1',
    });
    this.modelUri = `gpt://${folderId}/qwen2.5-vl-32b-instruct/latest`;
  }

  async extractBookData(
    imageBuffer: Buffer,
    prompt: string,
    mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
  ): Promise<IExtractionResult> {
    const base64 = imageBuffer.toString('base64');

    const response = await this.client.chat.completions.create({
      model: this.modelUri,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 1500,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    return JSON.parse(cleaned) as IExtractionResult;
  }
}

export class GeminiVisionExtractor {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://polza.ai/api/v1',
    });
  }

  async extractBookData(
    images: Array<{ url: string }>,
    prompt: string,
  ): Promise<IExtractionResult> {
    const imageContents = images.map(({ url }) => ({
      type: 'image_url' as const,
      image_url: { url },
    }));

    const response = await this.client.chat.completions.create({
      model: 'google/gemini-2.0-flash-001',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: prompt }, ...imageContents],
        },
      ],
      max_tokens: 6000,
    });

    const choice = response.choices[0];
    const raw = choice?.message?.content ?? '{}';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    if (choice?.finish_reason === 'length') {
      throw new Error('AI response truncated (max_tokens exceeded). Partial JSON discarded.');
    }
    return JSON.parse(cleaned) as IExtractionResult;
  }
}
