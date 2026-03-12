import { IExtractionResult } from '@bookscanner/shared';

/**
 * Claude Vision API extractor.
 * Note: @anthropic-ai/sdk dependency should be added when ready to use.
 */
export class ClaudeVisionExtractor {
  /**
   * Extract book data from an image using Claude Vision API.
   * TODO: Add @anthropic-ai/sdk dependency and implement
   */
  async extractBookData(
    imageBuffer: Buffer,
    prompt: string,
    apiKey: string,
  ): Promise<IExtractionResult> {
    // Placeholder - implement with @anthropic-ai/sdk when dependency is added
    // const Anthropic = require('@anthropic-ai/sdk');
    // const client = new Anthropic({ apiKey });
    // const response = await client.messages.create({
    //   model: 'claude-sonnet-4-20250514',
    //   max_tokens: 4096,
    //   messages: [{
    //     role: 'user',
    //     content: [
    //       { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBuffer.toString('base64') } },
    //       { type: 'text', text: prompt },
    //     ],
    //   }],
    // });
    throw new Error(
      'Claude Vision API not yet configured. Add @anthropic-ai/sdk dependency and set CLAUDE_API_KEY.',
    );
  }
}
