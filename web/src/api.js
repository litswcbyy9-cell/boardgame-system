export async function requestJson(path, opts = {}, config = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = config.token?.();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(path, { ...opts, headers });
  } catch {
    throw new Error(config.networkError || '无法连接后端服务，请稍后再试。');
  }

  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      message = config.errorMessage?.(body, response.statusText) || body?.message || body?.description || response.statusText;
    } catch {
      // keep status text
    }
    if (response.status === 401) config.onUnauthorized?.();
    throw new Error(message);
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}
