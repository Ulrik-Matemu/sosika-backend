const redisClient = require('./redisClient');

// Save FCM Token
const saveToken = async (userId, token, role) => {
  try {
    const normalizedRole = role.toLowerCase();
    const validRoles = ['user', 'vendor', 'deliveryperson'];

    if (!validRoles.includes(normalizedRole)) {
      throw new Error(`Invalid role: ${role}`);
    }

    const key = `fcm:${normalizedRole}:${userId.toString()}`;
    const tokenValue = token.toString();

    await redisClient.set(key, tokenValue);
    console.log(`FCM token saved for ${normalizedRole} ${userId}`, token);
  } catch (error) {
    console.error('Error saving token:', error);
    throw error;
  }
};

// Get FCM Token
const getToken = async (userId, role) => {
  if (!userId) {
    console.error('User ID is required to retrieve token');
    return null;
  }
  try {
    const safeUserId = userId.toString();
    const safeRole = role.toLowerCase();
    const redisKey = `fcm:${safeRole}:${safeUserId}`;

    const token = await redisClient.get(redisKey);
    return token;
  } catch (error) {
    console.error('Error retrieving token:', error);
    return null;
  }
};

// Remove FCM Token
const delToken = async (userId, role) => {
  try {
    const safeUserId = userId.toString();
    const safeRole = role.toLowerCase();
    const redisKey = `fcm:${safeRole}:${safeUserId}`;

    await redisClient.del(redisKey);
    console.log(`FCM token removed for ${safeRole} ${userId}`);
  } catch (error) {
    console.error('Error deleting token:', error);
  }
};

module.exports = { saveToken, getToken, delToken };
