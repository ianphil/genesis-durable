import { readFile } from 'node:fs/promises';
import { createModels, createProvider } from '@earendil-works/pi-ai/models';
import { stream, streamSimple } from '@earendil-works/pi-ai/api/openai-completions';

export const defaultModel = { provider: 'litellm', modelId: 'github/claude-haiku-5.5' };
export async function runtimeModels(endpoint: string, keyFile: string) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('model_configuration');
  const apiKey = (await readFile(keyFile, 'utf8')).trim();
  if (!apiKey) throw new Error('model_configuration');
  const models = createModels();
  models.setProvider(createProvider({ id: defaultModel.provider, baseUrl: url.href,
    auth: { apiKey: { name: 'Private runtime token', resolve: async () => ({ auth: { apiKey } }) } },
    api: { stream, streamSimple },
    models: [{ id: defaultModel.modelId, name: 'Claude Haiku 5.5', api: 'openai-completions', provider: defaultModel.provider,
      baseUrl: url.href, reasoning: false, input: ['text'], contextWindow: 1000000, maxTokens: 4096,
      compat: { supportsMidConvoSystemMessages: false, supportsMidConvoToolAdditions: false },
      cost: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 } }],
  }));
  return models;
}
