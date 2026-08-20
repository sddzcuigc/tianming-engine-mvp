const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';
const DEFAULT_OPENAI_MODEL = 'gpt-5';
const DEFAULT_GATEWAY_MODEL = 'openai/gpt-5.4-nano';
const MINISTERS = Object.freeze([
  { id: 'works', name: '工部尚书', duty: '制造、材料、工匠、工程可行性' },
  { id: 'revenue', name: '户部尚书', duty: '财政、供应、机会成本与持续投入' },
  { id: 'censor', name: '御史大夫', duty: '证据、地方执行、寻租与失败风险' }
]);

export const config = { maxDuration: 30 };

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST');
    return response.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const body = parseRequestBody(request.body);
    const question = String(body.question || '').trim().slice(0, 800);
    if (!question) return response.status(400).json({ error: 'question_required' });

    const state = normalizeState(body.state);
    const backend = resolveModelBackend(process.env);
    if (!backend) {
      return response.status(503).json({
        error: 'model_not_configured',
        detail: 'No direct model credential is configured and this runtime is not a Vercel deployment with AI Gateway OIDC support.'
      });
    }

    const messages = buildCourtMessages({ question, state });
    const content = await callModel(backend, messages);
    const result = parseCourtPayload(content);

    return response.status(200).json({
      ...result,
      model: backend.model,
      provider: backend.provider,
      ruleBoundary: 'advice_only'
    });
  } catch (error) {
    console.error('Court model call failed', error instanceof Error ? error.message : String(error));
    return response.status(502).json({ error: 'model_response_invalid' });
  }
}

function parseRequestBody(body) {
  if (!body) return {};
  if (typeof body === 'string') return JSON.parse(body);
  return body;
}

export function resolveModelBackend(env = {}) {
  const customBaseUrl = String(env.LLM_BASE_URL || '').trim().replace(/\/$/, '');
  if (customBaseUrl) {
    const apiKey = env.LLM_API_KEY || env.OPENAI_API_KEY;
    if (!apiKey) return null;
    return {
      provider: 'openai-compatible',
      transport: 'chat',
      baseUrl: customBaseUrl,
      apiKey,
      model: env.LLM_MODEL || env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL
    };
  }

  if (env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      transport: 'responses',
      baseUrl: OPENAI_BASE_URL,
      apiKey: env.OPENAI_API_KEY,
      model: env.OPENAI_MODEL || env.LLM_MODEL || DEFAULT_OPENAI_MODEL
    };
  }

  const gatewayKey = env.AI_GATEWAY_API_KEY || env.VERCEL_OIDC_TOKEN;
  if (gatewayKey) {
    return {
      provider: 'vercel-ai-gateway',
      transport: 'chat',
      baseUrl: GATEWAY_BASE_URL,
      apiKey: gatewayKey,
      model: env.LLM_MODEL || DEFAULT_GATEWAY_MODEL
    };
  }

  if (isVercelRuntime(env)) {
    return {
      provider: 'vercel-ai-gateway-oidc',
      transport: 'ai-sdk',
      model: env.LLM_MODEL || DEFAULT_GATEWAY_MODEL
    };
  }

  return null;
}

function isVercelRuntime(env) {
  return env.VERCEL === '1' || Boolean(env.VERCEL_ENV) || Boolean(env.VERCEL_URL);
}

async function callModel(backend, messages) {
  if (backend.transport === 'ai-sdk') {
    return callAiSdkModel(backend, messages);
  }

  const endpoint = backend.transport === 'responses' ? '/responses' : '/chat/completions';
  const requestBody = backend.transport === 'responses'
    ? {
        model: backend.model,
        input: messages.map((message) => ({
          role: message.role,
          content: [{ type: 'input_text', text: message.content }]
        })),
        max_output_tokens: 900
      }
    : {
        model: backend.model,
        messages,
        max_completion_tokens: 900
      };

  const upstream = await fetch(`${backend.baseUrl}${endpoint}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${backend.apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(25_000)
  });

  const raw = await upstream.text();
  if (!upstream.ok) {
    console.error('LLM upstream failed', backend.provider, upstream.status, raw.slice(0, 400));
    throw new Error(`model upstream failed with HTTP ${upstream.status}`);
  }

  const payload = JSON.parse(raw);
  const content = backend.transport === 'responses'
    ? extractResponsesText(payload)
    : extractChatText(payload);
  if (!content) throw new Error('model returned no text content');
  return content;
}

async function callAiSdkModel(backend, messages) {
  const { generateText } = await import('ai');
  const system = messages.find((message) => message.role === 'system')?.content || '';
  const prompt = messages
    .filter((message) => message.role !== 'system')
    .map((message) => message.content)
    .join('\n\n');

  const result = await generateText({
    model: backend.model,
    system,
    prompt,
    maxOutputTokens: 900,
    abortSignal: AbortSignal.timeout(25_000)
  });

  const content = typeof result?.text === 'string' ? result.text.trim() : '';
  if (!content) throw new Error('AI SDK returned no text content');
  return content;
}

function extractResponsesText(data) {
  if (typeof data?.output_text === 'string') return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') return content.text;
    }
  }
  return null;
}

function extractChatText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => typeof item?.text === 'string' ? item.text : '').join('').trim() || null;
  }
  return null;
}

export function normalizeState(input = {}) {
  const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  return {
    treasury: number(input.treasury, 100),
    coalSupply: number(input.coalSupply, 60),
    publicTrust: number(input.publicTrust, 72),
    knowledge: number(input.knowledge, 0),
    turn: number(input.turn, 1)
  };
}

export function buildCourtMessages({ question, state }) {
  const ministerContract = MINISTERS.map((minister) => `${minister.id}=${minister.name}（${minister.duty}）`).join('；');
  return [
    {
      role: 'system',
      content: [
        '你是《天命工程》的御前议政生成器。你的职责是生成有冲突、有证据边界的群臣意见，不是替规则引擎结算世界。',
        '绝对规则：不得修改国家状态数值；不得宣称工程已经成功或失败；不得把未知事实当成已知；需要信息时必须明确提出调查项。',
        `三位大臣固定为：${ministerContract}。三人必须因为职责不同而给出真正不同的判断。`,
        '只输出一个 JSON 对象，不要 Markdown。结构必须为：{"ministers":[{"id":"works","name":"工部尚书","position":"一句立场","reasoning":"2-4句理由","unknowns":["待查项"],"proposal":"下一步建议"},{"id":"revenue",...},{"id":"censor",...}],"synthesis":"一句话说明真正分歧在哪里"}。'
      ].join('\n')
    },
    {
      role: 'user',
      content: [
        '当前危机：北岭煤矿涌水，煤产量下降四成；铁工场缺燃料，军械交付延迟，财政收入开始下降。',
        `当前国家状态：${JSON.stringify(state)}。`,
        `皇帝追问：${question}`,
        '请围绕当前可验证事实作答；如果关键参数未知，就把它列入 unknowns，不要编造具体数字。'
      ].join('\n')
    }
  ];
}

export function parseCourtPayload(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('empty model content');
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('model content is not JSON');
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed.ministers) || parsed.ministers.length !== 3) throw new Error('expected three ministers');

  const byId = new Map(parsed.ministers.map((item) => [item?.id, item]));
  const ministers = MINISTERS.map((minister) => {
    const item = byId.get(minister.id);
    if (!item) throw new Error(`missing minister ${minister.id}`);
    return {
      id: minister.id,
      name: minister.name,
      position: cleanText(item.position, 120),
      reasoning: cleanText(item.reasoning, 600),
      unknowns: Array.isArray(item.unknowns) ? item.unknowns.slice(0, 5).map((value) => cleanText(value, 160)).filter(Boolean) : [],
      proposal: cleanText(item.proposal, 240)
    };
  });

  return {
    ministers,
    synthesis: cleanText(parsed.synthesis, 280)
  };
}

function cleanText(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}
