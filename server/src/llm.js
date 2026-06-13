// =====================================================================
// LLM 适配层 — OpenAI 兼容接口
// 无 API Key 时返回 mock，保证无 Key 也能跑通流程
// =====================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export function llmConfigured() {
  return Boolean(OPENAI_API_KEY);
}

export function llmInfo() {
  return { configured: llmConfigured(), model: OPENAI_MODEL, baseUrl: OPENAI_BASE_URL };
}

// messages: [{role, content}]。opts.json=true 时要求返回 JSON。
// 返回 { content, mock } —— mock=true 表示未配置 Key 的占位回答。
export async function callLLM(messages, opts = {}) {
  if (!OPENAI_API_KEY) {
    return { content: mockReply(messages, opts), mock: true };
  }
  const body = {
    model: opts.model || OPENAI_MODEL,
    messages,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 30000);
  try {
    const resp = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`LLM API ${resp.status}: ${text.slice(0, 200)}`);
    }
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    return { content, mock: false };
  } finally {
    clearTimeout(timeout);
  }
}

// 无 Key 时的占位回答，按用途给出有意义的提示
function mockReply(messages, opts) {
  const last = messages[messages.length - 1]?.content || '';
  if (opts.json) {
    return JSON.stringify({ mock: true, note: '未配置 OPENAI_API_KEY，返回占位数据', echo: String(last).slice(0, 80) });
  }
  return `【演示回答 · 未配置大模型】\n你的输入：${String(last).slice(0, 120)}\n\n配置 server/.env 中的 OPENAI_API_KEY 后即可获得真实 AI 回答。支持任意 OpenAI 兼容接口（通义千问/DeepSeek/Moonshot/智谱等），填好 OPENAI_BASE_URL 和 OPENAI_MODEL 即可。`;
}
