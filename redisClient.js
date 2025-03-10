require('dotenv').config();
const redis = require('redis');

// Create Redis client
const client = redis.createClient({
  url: process.env.REDIS_URL, // Change this if Redis is hosted remotely
});

client.on('error', (err) => console.error('Redis Error:', err));

// Connect to Redis
client.connect().then(() => console.log('Connected to Redis'));

module.exports = client;
