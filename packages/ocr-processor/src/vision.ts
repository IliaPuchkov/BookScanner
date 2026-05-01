import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import { IExtractionResult } from "@bookscanner/shared";

export class OpenAIVisionExtractor {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async extractBookData(
    imageBuffer: Buffer,
    prompt: string,
    mimeType: "image/jpeg" | "image/png" = "image/jpeg",
  ): Promise<IExtractionResult> {
    const base64 = imageBuffer.toString("base64");

    const response = await this.client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    return JSON.parse(raw) as IExtractionResult;
  }
}

export class YandexVisionExtractor {
  private readonly client: OpenAI;
  private readonly modelUri: string;

  constructor(apiKey: string, folderId: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://llm.api.cloud.yandex.net/v1",
    });
    this.modelUri = `gpt://${folderId}/qwen2.5-vl-32b-instruct/latest`;
  }

  async extractBookData(
    imageBuffer: Buffer,
    prompt: string,
    mimeType: "image/jpeg" | "image/png" = "image/jpeg",
  ): Promise<IExtractionResult> {
    const base64 = imageBuffer.toString("base64");

    const response = await this.client.chat.completions.create({
      model: this.modelUri,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
              },
            },
          ],
        },
      ],
      max_tokens: 4000,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    return JSON.parse(cleaned) as IExtractionResult;
  }
}

export class GeminiVisionExtractor {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL: "https://polza.ai/api/v1",
    });
  }

  async extractBookData(
    images: Array<{ url: string }>,
    prompt: string,
  ): Promise<IExtractionResult> {
    const imageContents = images.map(({ url }) => ({
      type: "image_url" as const,
      image_url: { url },
    }));

    const requestBody: ChatCompletionCreateParamsNonStreaming = {
      model: "google/gemini-2.0-flash-lite-001",
      max_tokens: 1500,
      response_format: { type: "json_object" as const },
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: prompt }, ...imageContents],
        },
      ],
    };

    const response = await this.client.chat.completions.create(requestBody).catch((err: any) => {
      console.error("[GeminiVisionExtractor] HTTP error from Polza.AI");
      console.error("[GeminiVisionExtractor] HTTP status:", err?.status);
      console.error("[GeminiVisionExtractor] Error message:", err?.message);
      console.error("[GeminiVisionExtractor] Error body:", JSON.stringify(err?.error ?? err?.response?.data ?? null));
      throw err;
    });

    const choice = response.choices[0];
    const raw = choice?.message?.content || "";
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
    if (!cleaned) {
      console.error("[GeminiVisionExtractor] Empty response from AI");
      console.error("[GeminiVisionExtractor] finish_reason:", choice?.finish_reason);
      console.error("[GeminiVisionExtractor] usage:", JSON.stringify(response.usage));
      console.error("[GeminiVisionExtractor] message.refusal:", choice?.message?.refusal);
      console.error("[GeminiVisionExtractor] raw content repr:", JSON.stringify(raw));
      console.error("[GeminiVisionExtractor] image_urls:", images.map(i => i.url));
      throw new Error(
        "AI returned empty response. Possibly image URL expired or inaccessible.",
      );
    }
    try {
      return JSON.parse(cleaned) as IExtractionResult;
    } catch (err) {
      console.error("[GeminiVisionExtractor] JSON parse failed");
      console.error("[GeminiVisionExtractor] finish_reason:", choice?.finish_reason);
      console.error("[GeminiVisionExtractor] usage:", JSON.stringify(response.usage));
      console.error("[GeminiVisionExtractor] raw response length:", raw.length);
      console.error("[GeminiVisionExtractor] raw response:\n", raw);
      throw err;
    }
  }
}
