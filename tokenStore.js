const redisClient = require('./redisClient');

// Save FCM Token
const saveToken = async (userId, token) => {
  try {
   console.log(userId);
   console.log(token);

    await redisClient.set(userId, token);
    console.log(`FCM token saved for user ${userId}`);
  } catch (error) {
    console.error('Error saving token:', error);
  }
};

// Get FCM Token
const getToken = async (userId) => {
  try {
    return await redisClient.get(userId);
  } catch (error) {
    console.error('Error retrieving token:', error);
    return null;
  }
};

// Remove FCM Token
const removeToken = async (userId) => {
  try {
    await redisClient.del(userId);
    console.log(`FCM token removed for user ${userId}`);
  } catch (error) {
    console.error('Error deleting token:', error);
  }
};

module.exports = { saveToken, getToken, removeToken };
