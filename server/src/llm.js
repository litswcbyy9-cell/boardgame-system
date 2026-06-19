// =====================================================================
// LLM 适配层 — OpenAI 兼容接口
// 无 API Key 时返回 mock，保证无 Key 也能跑通流程
// =====================================================================

// 惰性读取 env：ES 模块 import 早于 dotenv.config()，故不能在模块顶层求值，
// 否则读到的是空值。改为每次调用时读 process.env（此时 dotenv 已加载）。
function cfg() {
  return {
    key: process.env.OPENAI_API_KEY || '',
    baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  };
}

export function llmConfigured() {
  return Boolean(cfg().key);
}

export function llmInfo() {
  const { key, model, baseUrl } = cfg();
  return { configured: Boolean(key), model, baseUrl };
}

// messages: [{role, content}]。opts.json=true 时要求返回 JSON。
// 返回 { content, mock } —— mock=true 表示未配置 Key 的占位回答。
export async function callLLM(messages, opts = {}) {
  const { key, baseUrl, model } = cfg();
  if (!key) {
    return { content: mockReply(messages, opts), mock: true };
  }
  const body = {
    model: opts.model || model,
    messages,
    temperature: opts.temperature ?? 0.7,
  };
  if (opts.json) body.response_format = { type: 'json_object' };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;

  const urls = [`${baseUrl}/chat/completions`];
  if (!baseUrl.endsWith('/v1')) urls.push(`${baseUrl}/v1/chat/completions`);

  let lastError;
  for (const url of urls) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs || 30000);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        const error = new Error(`LLM API ${resp.status} ${url}: ${text.slice(0, 200)}`);
        lastError = error;
        if ((resp.status === 404 || resp.status === 405) && url !== urls[urls.length - 1]) {
          continue;
        }
        throw error;
      }
      const data = await resp.json();
      const msg = data?.choices?.[0]?.message ?? {};
      // 推理模型（如 deepseek-v4-flash）正式答案在 content，思考在 reasoning_content；
      // content 为空时回退到 reasoning_content。
      const content = (msg.content && msg.content.trim()) ? msg.content : (msg.reasoning_content || '');
      return { content, mock: false };
    } catch (error) {
      lastError = error;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

// 无 Key 时的占位回答，按用途给出有意义的提示
function mockReply(messages, opts) {
  const last = messages[messages.length - 1]?.content || '';
  if (opts.json) {
    return JSON.stringify({ mock: true, note: '未配置 OPENAI_API_KEY，返回占位数据', echo: String(last).slice(0, 80) });
  }
  return `【演示回答 · 未配置大模型】\n你的输入：${String(last).slice(0, 120)}\n\n配置 server/.env 中的 OPENAI_API_KEY 后即可获得真实 AI 回答。支持任意 OpenAI 兼容接口（通义千问/DeepSeek/Moonshot/智谱等），填好 OPENAI_BASE_URL 和 OPENAI_MODEL 即可。`;
}
