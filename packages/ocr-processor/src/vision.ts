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
      max_tokens: 500,
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    return JSON.parse(raw) as IExtractionResult;
  }
}
