const baseUrl = (process.env.E2E_BASE_URL || 'http://127.0.0.1:8788').replace(/\/+$/, '');

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    headers: { accept: path.startsWith('/api/') ? 'application/json' : 'text/html' },
  });
  const text = await response.text();
  return { response, text };
}

function assertOk(label, response, predicate = (status) => status >= 200 && status < 400) {
  if (!predicate(response.status)) {
    throw new Error(`${label} failed: HTTP ${response.status}`);
  }
}

const checks = [
  ['customer home', '/'],
  ['admin shell', '/admin'],
  ['health', '/api/health'],
];

for (const [label, path] of checks) {
  const { response, text } = await request(path);
  assertOk(label, response, path === '/api/health' ? (status) => status === 200 || status === 503 : undefined);
  if (path === '/api/health') {
    const health = JSON.parse(text);
    if (!health.db || !health.migrations || !health.ai) {
      throw new Error('health payload is missing db/migrations/ai sections');
    }
  } else if (!text.includes('<!doctype html') && !text.includes('<html')) {
    throw new Error(`${label} did not return an HTML shell`);
  }
  console.log(`[e2e] ${label} ok`);
}
