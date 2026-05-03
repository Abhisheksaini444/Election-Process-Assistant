import test from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { __resetRateLimiterForTests } from '../middleware/rateLimiter.js';
import { __resetStoreForTests } from '../services/storeService.js';

const startServer = () => {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
};

test('health endpoint responds with ok', async () => {
  __resetRateLimiterForTests();
  const server = await startServer();

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
  } finally {
    server.close();
  }
});

test('verify endpoint validates empty claim', async () => {
  __resetRateLimiterForTests();
  const server = await startServer();

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim: '   ' })
    });

    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('analytics summary returns defaults', async () => {
  __resetRateLimiterForTests();
  __resetStoreForTests();
  const server = await startServer();

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/analytics/summary`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.totalVerifications, 0);
  } finally {
    server.close();
  }
});

test('docs endpoint includes stream endpoint', async () => {
  __resetRateLimiterForTests();
  const server = await startServer();

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/docs`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(Array.isArray(body.endpoints), true);
    assert.equal(body.endpoints.some((item) => item.path === '/api/verify/stream'), true);
  } finally {
    server.close();
  }
});

test('stream endpoint validates empty claim with 400', async () => {
  __resetRateLimiterForTests();
  const server = await startServer();

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/api/verify/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim: '   ' })
    });

    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});
