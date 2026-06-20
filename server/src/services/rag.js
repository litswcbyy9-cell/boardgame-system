// =====================================================================
// RAG 桌游知识库 — 检索增强生成
// 流程：用户问题 → MySQL 全文检索命中相关桌游（含规则描述语料）
//        → 拼接为带编号的上下文 → 交给大模型基于上下文作答 → 返回答案 + 出处
// 让顾客 AI 客服能回答具体桌游规则，且答案有据可查、不凭空编造。
// =====================================================================

// 停用词/标点清洗，避免把「怎么玩」这类问法词当检索关键词稀释相关度。
const STOPWORDS = new Set([
  '怎么', '怎样', '如何', '玩法', '规则', '介绍', '一下', '可以', '什么',
  '这个', '那个', '请问', '想问', '我们', '适合', '推荐', '有没有', '是不是',
  '多少', '需要', '应该', '的', '吗', '呢', '啊', '了', '和', '与', '或',
]);

export function extractKeywords(message) {
  const cleaned = String(message || '')
    .replace(/[，。！？、；：“”‘’（）【】\[\](){}!?,.;:'"`~@#$%^&*\-_=+|\\/<>]/g, ' ')
    .trim();
  if (!cleaned) return '';
  // 先去掉成段停用词，再保留剩余内容作为检索词；全被过滤时回退原句。
  let result = cleaned;
  for (const word of STOPWORDS) {
    result = result.split(word).join(' ');
  }
  result = result.replace(/\s+/g, ' ').trim();
  return result || cleaned;
}

// 检索与问题相关的桌游：全文检索优先，LIKE 回退（与项目既有检索策略一致）。
export async function retrieveGames(pool, message, { limit = 4 } = {}) {
  const query = extractKeywords(message);
  if (!query) return [];

  try {
    const [ftRows] = await pool.query(
      `SELECT id, title, category, description,
              min_players AS minPlayers, max_players AS maxPlayers,
              avg_minutes AS avgMinutes, difficulty_level AS difficulty,
              ROUND(MATCH(title, category, description) AGAINST(? IN NATURAL LANGUAGE MODE), 3) AS relevance
         FROM games
        WHERE MATCH(title, category, description) AGAINST(? IN NATURAL LANGUAGE MODE)
        ORDER BY relevance DESC
        LIMIT ?`,
      [query, query, limit]
    );
    if (ftRows.length) return ftRows;
  } catch (error) {
    console.error('[WARN] rag fulltext failed, fallback to LIKE:', error.message);
  }

  // 回退：短词或 ngram 未命中时用 LIKE 双保险。
  const like = `%${query.split(' ')[0] || query}%`;
  const [likeRows] = await pool.query(
    `SELECT id, title, category, description,
            min_players AS minPlayers, max_players AS maxPlayers,
            avg_minutes AS avgMinutes, difficulty_level AS difficulty,
            NULL AS relevance
       FROM games
      WHERE title LIKE ? OR description LIKE ? OR category LIKE ?
      ORDER BY recommend_weight DESC
      LIMIT ?`,
    [like, like, like, limit]
  );
  return likeRows;
}

// 把检索到的桌游拼成带编号的上下文块，供大模型引用，并产出出处清单。
export function buildRagContext(games) {
  if (!games.length) {
    return { context: '', sources: [] };
  }
  const blocks = games.map((game, index) => {
    const meta = `${game.category || '桌游'} · ${game.minPlayers}-${game.maxPlayers}人 · 约${game.avgMinutes}分钟 · 难度${game.difficulty}/5`;
    return `[资料${index + 1}] ${game.title}（${meta}）\n${game.description || '（暂无详细规则资料）'}`;
  });
  const sources = games.map((game) => ({
    id: game.id,
    title: game.title,
    category: game.category,
    relevance: game.relevance,
  }));
  return { context: blocks.join('\n\n'), sources };
}

// 基于检索上下文回答桌游知识问题。返回 { reply, sources, mock, retrieved }。
export async function answerGameQuestion({ pool, callLLM, sanitizeAiReply }, message) {
  const games = await retrieveGames(pool, message, { limit: 4 });
  const { context, sources } = buildRagContext(games);

  // 没有检索到任何资料时，不强行让模型作答，避免编造。
  if (!context) {
    return {
      reply: '抱歉，店里的桌游资料库暂时没找到和这个问题直接相关的桌游。你可以换个说法，或者告诉我你想要的人数、时长和类型，我帮你推荐。',
      sources: [],
      mock: false,
      retrieved: 0,
    };
  }

  const system = `你是桌游馆的桌游知识助手。请严格依据下方「桌游资料」回答顾客的问题，可以总结、解释、对比，但不得编造资料中没有的规则或数据。若资料不足以回答，就如实说明并建议顾客到店咨询。回答用中文，条理清晰、热情友好，控制在 200 字内。引用具体桌游时自然带出名称。

桌游资料：
${context}`;

  const { content, mock } = await callLLM(
    [
      { role: 'system', content: system },
      { role: 'user', content: message },
    ],
    { temperature: 0.3, maxTokens: 1600 }
  );

  return {
    reply: sanitizeAiReply ? sanitizeAiReply(content) : content,
    sources,
    mock,
    retrieved: games.length,
  };
}
