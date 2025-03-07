import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '10s', target: 50 }, // Ramp up to 50 users in 10s
    { duration: '30s', target: 50 }, // Stay at 50 users for 30s
    { duration: '10s', target: 0 },  // Ramp down to 0 users in 10s
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be < 500ms
    http_req_failed: ['rate<0.01'],   // Failure rate should be < 1%
  },
};

export default function () {
  let url = 'https://sosika-backend.onrender.com/api/auth/login'; // Replace with your actual login endpoint
  let payload = JSON.stringify({
    email: 'ulrikjosephat@gmail.com',
    password: 'pass123XLV',
  });

  let params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  let response = http.post(url, payload, params);

  check(response, {
    'is status 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1); // Simulate user think time before next request
}
