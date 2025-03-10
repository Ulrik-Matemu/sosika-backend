const client = require('./redisClient');

(async () => {
  await client.set('testKey', 'Hello from Remote Redis!');
  const value = await client.get('testKey');
  console.log('Fetched from Redis:', value);
})();
