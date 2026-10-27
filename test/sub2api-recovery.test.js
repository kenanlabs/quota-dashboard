const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.OUTBOUND_ALLOW_PRIVATE = 'true';
process.env.OUTBOUND_ALLOW_HTTP = 'true';
process.env.NODE_ENV = 'test';

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function startServer(handler) {
  return new Promise(resolve => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        base: `http://127.0.0.1:${server.address().port}`
      });
    });
  });
}

test('public recovery uses unified runtime recovery and never force-activates inactive accounts', async () => {
  const { clearAccountError } = require('../services/sub2api');
  const calls = [];
  let status = 'throttled';

  const { server, base } = await startServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.url === '/api/v1/admin/accounts/9' && req.method === 'GET') {
      return send(res, 200, {
        data: {
          id: 9,
          status: status === 'inactive' ? 'inactive' : 'active',
          schedulable: true,
          rate_limit_reset_at: status === 'throttled'
            ? new Date(Date.now() + 3600000).toISOString()
            : null
        }
      });
    }
    if (req.url === '/api/v1/admin/accounts/9/recover-state' && req.method === 'POST') {
      status = 'active';
      return send(res, 200, {
        data: { id: 9, status: 'active', schedulable: true }
      });
    }
    send(res, 404, { message: 'not found' });
  });

  try {
    const result = await clearAccountError(base, 'control-key', 9, {
      allowPersistentActivation: false
    });
    assert.equal(result.success, true);
    assert.equal(result.status, 'active');
    assert.equal(calls.includes('PUT /api/v1/admin/accounts/9'), false);

    status = 'inactive';
    await assert.rejects(
      () => clearAccountError(base, 'control-key', 9, { allowPersistentActivation: false }),
      err => err.statusCode === 409
    );
    assert.equal(calls.includes('PUT /api/v1/admin/accounts/9'), false);
  } finally {
    server.close();
  }
});

test('scoped admin key recovery only calls whitelisted account read and clear-error endpoints', async () => {
  const { clearAccountError } = require('../services/sub2api');
  const calls = [];
  let status = 'throttled';

  const { server, base } = await startServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.url === '/api/v1/admin/accounts/17' && req.method === 'GET') {
      return send(res, 200, {
        data: {
          id: 17,
          status: status === 'throttled' ? 'active' : status,
          schedulable: true,
          rate_limit_reset_at: status === 'throttled'
            ? new Date(Date.now() + 3600000).toISOString()
            : null
        }
      });
    }
    if (req.url === '/api/v1/admin/accounts/17/clear-error' && req.method === 'POST') {
      status = 'active';
      return send(res, 200, {
        data: { id: 17, status: 'active', schedulable: true }
      });
    }
    if (
      req.url === '/api/v1/admin/accounts/17/recover-state' ||
      req.url === '/api/v1/admin/accounts/17/clear-rate-limit' ||
      req.url === '/api/v1/admin/accounts/17/temp-unschedulable'
    ) {
      return send(res, 403, { message: 'forbidden for scoped key' });
    }
    send(res, 404, { message: 'not found' });
  });

  try {
    const result = await clearAccountError(base, 'adm_sc_fixture_secret', 17, {
      allowPersistentActivation: false,
      controlMode: 'scoped'
    });
    assert.equal(result.success, true);
    assert.equal(result.status, 'active');
    assert.deepEqual(calls, [
      'GET /api/v1/admin/accounts/17',
      'POST /api/v1/admin/accounts/17/clear-error',
      'GET /api/v1/admin/accounts/17'
    ]);
  } finally {
    server.close();
  }
});

test('scoped admin key recovery refuses inactive accounts before any write', async () => {
  const { clearAccountError } = require('../services/sub2api');
  const calls = [];

  const { server, base } = await startServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.url === '/api/v1/admin/accounts/23' && req.method === 'GET') {
      return send(res, 200, {
        data: { id: 23, status: 'inactive', schedulable: false }
      });
    }
    send(res, 500, { message: 'unexpected write' });
  });

  try {
    await assert.rejects(
      () => clearAccountError(base, 'adm_sc_fixture_secret', 23, {
        allowPersistentActivation: false,
        controlMode: 'scoped'
      }),
      err => err.statusCode === 409
    );
    assert.deepEqual(calls, ['GET /api/v1/admin/accounts/23']);
  } finally {
    server.close();
  }
});

test('Sub2API metadata fetch aborts when the account list cannot be read', async () => {
  const { fetchSub2apiData } = require('../services/sub2api');
  const calls = [];
  const { server, base } = await startServer((req, res) => {
    calls.push(`${req.method} ${req.url}`);
    if (req.url.startsWith('/api/v1/admin/groups/all') && req.method === 'GET') {
      return send(res, 200, { data: [] });
    }
    if (req.url.startsWith('/api/v1/admin/accounts') && req.method === 'GET') {
      return send(res, 503, { message: 'temporary outage' });
    }
    send(res, 404, { message: 'not found' });
  });

  try {
    await assert.rejects(
      () => fetchSub2apiData(base, 'admin-key', { includeCredentials: false }),
      /无法获取 Sub2API 账号列表/
    );
    assert.equal(calls.some(call => call.includes('/accounts')), true);
  } finally {
    server.close();
  }
});
