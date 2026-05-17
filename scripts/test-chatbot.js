/**
 * Test script for the chatbot API.
 * Uses JWT token directly (middleware now accepts both JWT and Firebase ID tokens).
 *
 * Usage: node scripts/test-chatbot.js
 */

const http = require('http');

const API_BASE = 'http://localhost:5000';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== Step 1: Login ===');
  const loginRes = await request('POST', '/api/auth/login', {
    email: 'admin@sce.com',
    password: 'New@12345!',
  });
  if (loginRes.status !== 200) {
    console.error('Login failed:', loginRes.status, loginRes.data);
    process.exit(1);
  }
  const jwtToken = loginRes.data.token;
  console.log('User role:', loginRes.data.user.role);

  console.log('\n=== Step 2: Get chat sessions (empty) ===');
  const sessionsRes = await request('GET', '/api/chatbot/sessions', null, jwtToken);
  console.log('Sessions:', JSON.stringify(sessionsRes.data, null, 2));

  const sessionId = 'test-session-' + Date.now();

  console.log(`\n=== Step 3: Send message (session: ${sessionId}) ===`);
  const chatRes = await request('POST', '/api/chatbot/message', {
    message: 'Hello, what data do you have about stock levels?',
    sessionId,
  }, jwtToken);
  console.log('Status:', chatRes.status);

  if (chatRes.status === 200) {
    console.log('AI Response:', chatRes.data.response?.substring(0, 300) + '...');
    console.log('Timestamp:', chatRes.data.timestamp);
    console.log('\n✅ Chatbot test PASSED!');
  } else {
    console.log('Error:', JSON.stringify(chatRes.data, null, 2));
    console.log('\n❌ Chatbot test FAILED');
  }

  console.log('\n=== Step 4: List sessions again ===');
  const sessionsRes2 = await request('GET', '/api/chatbot/sessions', null, jwtToken);
  console.log('Sessions count:', sessionsRes2.data?.sessions?.length || 0);

  console.log('\n=== Step 5: Delete test session ===');
  const deleteRes = await request('DELETE', `/api/chatbot/session/${sessionId}`, null, jwtToken);
  console.log('Delete status:', deleteRes.status, JSON.stringify(deleteRes.data));
}

main().catch(console.error);
