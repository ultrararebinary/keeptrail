import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { URL } from 'node:url';
import { z } from 'zod';
import type { ProviderId } from '@keeptrail/shared';

export const providerModels: Record<ProviderId, string> = {
  mistral: 'mistral/mistral-small-latest',
  groq: 'groq/qwen/qwen3.6-27b',
  openrouter: 'openrouter/openrouter/free',
  gemini: 'gemini/gemini-2.5-flash-lite'
};

const ChatResponse = z.object({
  id: z.string().optional(),
  model: z.string().max(240).optional(),
  object: z.string().optional(),
  created: z.number().int().nonnegative().optional(),
  choices: z.array(z.object({ index: z.number().int().nonnegative().optional(), message: z.object({ role: z.string().optional(), content: z.union([z.string(), z.array(z.unknown())]) }).strict(), finish_reason: z.string().nullable().optional() }).strict()).min(1).max(4),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative().optional(), completion_tokens: z.number().int().nonnegative().optional(), total_tokens: z.number().int().nonnegative().optional() }).partial().optional()
}).strict();

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> };

export class GatewayError extends Error {
  constructor(public readonly status: number, message: string, public readonly retryAfter: string | null = null) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class OmniRouteClient {
  constructor(private readonly options: { baseUrl?: string; apiKey: string; provider: ProviderId }) {
    const baseUrl = options.baseUrl ?? 'http://127.0.0.1:20129';
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1' || Number(parsed.port || 80) !== 20129) throw new Error('OmniRoute must use the managed loopback gateway at 127.0.0.1:20129.');
  }

  get model(): string { return providerModels[this.options.provider]; }

  async chat(messages: ChatMessage[], maxTokens = 1024, timeoutMs = 60_000): Promise<{ content: string; returnedModel: string | null; usage: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.options.baseUrl ?? 'http://127.0.0.1:20129'}/v1/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.options.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.model, messages, stream: false, temperature: 0, max_tokens: Math.min(1024, Math.max(1, Math.floor(maxTokens))) }),
        signal: controller.signal
      });
      if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        await response.body?.cancel();
        throw new GatewayError(response.status, `The managed gateway returned HTTP ${response.status}.`, retryAfter);
      }
      const body = ChatResponse.safeParse(await response.json());
      if (!body.success) throw new GatewayError(502, 'The managed gateway returned an invalid chat response.');
      const message = body.data.choices[0]?.message.content;
      const content = typeof message === 'string' ? message : JSON.stringify(message);
      return { content, returnedModel: body.data.model ?? null, usage: body.data.usage?.total_tokens ?? 0 };
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError(0, error instanceof Error && error.name === 'AbortError' ? 'The managed gateway request timed out.' : 'The managed gateway could not be reached.');
    } finally {
      clearTimeout(timeout);
    }
  }

  async healthCheck(fixturePath: string): Promise<{ textPassed: boolean; visionPassed: boolean; returnedModels: string[] }> {
    const text = await this.chat([{ role: 'user', content: 'Reply with exactly the JSON object {"ok":true} and no other text.' }], 32);
    const parsed = z.object({ ok: z.literal(true) }).safeParse(JSON.parse(text.content));
    if (!parsed.success) throw new GatewayError(502, 'The managed gateway text health response failed structured validation.');
    const bytes = await readFile(fixturePath);
    const mime = fixturePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    const vision = await this.chat([{ role: 'user', content: [{ type: 'text', text: 'Describe this local health-check image in one short JSON object with a nonempty description.' }, { type: 'image_url', image_url: { url: `data:${mime};base64,${bytes.toString('base64')}` } }] }], 128);
    const visionJson = z.record(z.string(), z.unknown()).safeParse(JSON.parse(vision.content));
    if (!visionJson.success || !Object.values(visionJson.data).some((value) => typeof value === 'string' && value.length > 0)) throw new GatewayError(502, 'The managed gateway vision health response failed structured validation.');
    return { textPassed: true, visionPassed: true, returnedModels: [text.returnedModel, vision.returnedModel].filter((value): value is string => Boolean(value)) };
  }
}

export async function readInferenceKey(path: string): Promise<string> {
  const value = (await readFile(path, 'utf8')).trim();
  if (!value) throw new Error(`Managed inference key file ${basename(path)} is empty.`);
  return value;
}
