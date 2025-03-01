const request = require('supertest');
const express = require('express');
const pool = require('../db'); // Adjust based on your setup
const collegeRoutes = require('../routes/colleges'); // Adjust based on your route file

jest.setTimeout(30000); // Increase Jest timeout to 30s

const app = express();
app.use(express.json());
app.use('/api', collegeRoutes);

describe('College Routes', () => {
  beforeAll(async () => {
    await pool.query('DELETE FROM college'); // Clear database before tests
  });

  it('should add a new college', async () => {
    const res = await request(app).post('/api/colleges').send({
      name: 'Test University',
      address: '123 College Street',
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('College Added Successfully');
  });

  it('should return a list of colleges', async () => {
    const res = await request(app).get('/api/colleges');

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('should return 404 if no colleges exist', async () => {
    await pool.query('DELETE FROM college'); // Ensure table is empty

    const res = await request(app).get('/api/colleges');

    expect(res.statusCode).toBe(404);
    expect(res.body.error).toBe('No colleges found');
  });

  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay for cleanup
    await pool.end(); // Close database connection
  });
});
