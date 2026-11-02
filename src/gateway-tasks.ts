import { JsonRpcTransportHandler, type A2ARequestHandler, type ServerCallContext } from '@a2a-js/sdk/server';
import { LegacyJsonRpcTransportHandler } from '@a2a-js/sdk/compat/v0_3/server';

// Exception: deployed LiteLLM sends task controls to the discovery base using
// v0.3 method names. Reproduced get/list 404 through the real gateway in #6.
// Remove after deployed native get/list/cancel probes pass without this adapter:
// https://github.com/BerriAI/litellm/pull/44769
export function gatewayTaskTransport(handler: A2ARequestHandler) {
  const native = new JsonRpcTransportHandler(handler);
  const legacy = new LegacyJsonRpcTransportHandler(handler);
  return async (text: string, context: ServerCallContext) => {
    let body;
    try { body = JSON.parse(text); } catch { return native.handle(text, context); }
    if (body?.method === 'tasks/list') return native.handle({ ...body, method: 'ListTasks' }, context);
    if (['tasks/get', 'tasks/cancel'].includes(body?.method)) return legacy.handle(body, context);
    return native.handle(text, context);
  };
}
