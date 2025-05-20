import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '10s', target: 10 }, // ramp up to 10 users
    { duration: '30s', target: 10 }, // stay at 10 users
    { duration: '10s', target: 0 },  // ramp down to 0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.01'],   // less than 1% should fail
  },
};

export default function () {
  const loginUrl = 'https://sosika-backend.onrender.com/api/auth/login';
  const loginPayload = JSON.stringify({
    email: 'ulrikjosephat@gmail.com',
    password: 'pass123XLV',
  });

  const loginParams = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const loginRes = http.post(loginUrl, loginPayload, loginParams);

  check(loginRes, {
    'login status is 200': (r) => r.status === 200,
    'login response time < 500ms': (r) => r.timings.duration < 500,
  });

  const authToken = loginRes.json('token'); // Make sure this matches your backend's token key

  // Fetch menu items
  const menuUrl = 'https://sosika-backend.onrender.com/api/menuItems';
  const menuParams = {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  };

  const menuRes = http.get(menuUrl, menuParams);

  check(menuRes, {
    'menu status is 200': (r) => r.status === 200,
    'menu response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}

