const webPush = require('web-push');
const { createClient } = require('redis');

// Redis client setup
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Connect to Redis
(async () => {
  redisClient.on('error', (err) => console.log('Redis Client Error', err));
  await redisClient.connect();
  console.log('Connected to Redis');
})();

// The notification function
async function sendVendorNotification(vendorId, title, body, url) {
  try {
    const key = `push:vendor:${vendorId}`;
    const data = await redisClient.get(key);
    
    if (!data) {
      console.log(`No subscriptions found for vendor ${vendorId}`);
      return [];
    }
    
    const subscriptions = JSON.parse(data);
    const payload = JSON.stringify({
      title,
      body,
      url
    });
    
    const results = [];
    const validSubscriptions = [];
    
    for (const subscription of subscriptions) {
      try {
        await webPush.sendNotification(subscription, payload);
        results.push({ success: true });
        validSubscriptions.push(subscription);
      } catch (error) {
        console.error(`Error sending notification to vendor ${vendorId}:`, error);
        
        // Don't add expired subscriptions to the valid list
        if (error.statusCode !== 410) {
          validSubscriptions.push(subscription);
        }
        
        results.push({ success: false, error: error.message });
      }
    }
    
    // Update the Redis store with only valid subscriptions
    if (validSubscriptions.length !== subscriptions.length) {
      await redisClient.set(key, JSON.stringify(validSubscriptions));
    }
    
    return results;
  } catch (error) {
    console.error('Error sending vendor notification:', error);
    return [{ success: false, error: error.message }];
  }
}

// Export the function
module.exports = {
  sendVendorNotification
};