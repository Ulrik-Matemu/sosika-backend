const redisClient = require('./redisClient');

// Save FCM Token
const saveToken = async (userId, token) => {
  try {
    // Ensure userId is converted to string
    const userKey = `user:${userId.toString()}`;
    
    // Ensure token is a string
    const tokenValue = token.toString();
    
    await redisClient.set(userKey, tokenValue);
    console.log(`FCM token saved for user ${userId}`, token);
  } catch (error) {
    console.error('Error saving token:', error);
    throw error; // Re-throw to allow proper error handling
  }
};

// Get FCM Token
const getToken = async (userId) => {
  try {
    const userKey = `user:${userId.toString()}`;
    return await redisClient.get(userKey);
  } catch (error) {
    console.error('Error retrieving token:', error);
    return null;
  }
};

// Remove FCM Token
const removeToken = async (userId) => {
  try {
    const userKey = `user:${userId.toString()}`;
    await redisClient.del(userKey);
    console.log(`FCM token removed for user ${userId}`);
  } catch (error) {
    console.error('Error deleting token:', error);
  }
};

module.exports = { saveToken, getToken, removeToken };