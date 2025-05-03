import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '10s', target: 50 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
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

  const authToken = loginRes.json('token'); // Adjust if your token key is named differently

  // Now fetch menu items
  const menuUrl = 'https://sosika-backend.onrender.com/api/menuItems'; // Replace with actual endpoint
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
