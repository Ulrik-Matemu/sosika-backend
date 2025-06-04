const admin = require('./firebase'); // Firebase instance
const { getToken } = require('./tokenStore'); // Import Redis token retrieval function
const { delToken } = require('./tokenStore');


const removeUserTokenFromDatabase = async (userId) => {
  try {
    const userKey = `user:${userId.toString()}`;
    await redisClient.delToken(userKey); // Remove token from the database
    console.log(`FCM token removed for user ${userId}`);
  } catch (error) {
    console.error('Error removing token:', error);
  }
};

const sendNotificationToUser = async (userId, role, title, body) => {
  try {
    const deviceToken = await getToken(userId, role);
    if (!deviceToken) {
      console.log(`No FCM token found for ${role} ${userId}`);
      return;
    }

    const message = {
      notification: { title, body },
      token: deviceToken,
    };

    const response = await admin.messaging().send(message);
    console.log(`Notification sent to ${role} ${userId}:`, response);
  } catch (error) {
    console.error(`Error sending notification to ${role} ${userId}:`, error);

    // Handle invalid token (registration-token-not-registered)
    if (error.code === 'messaging/registration-token-not-registered') {
      console.log(`FCM token is no longer valid for ${role} ${userId}. Removing token...`);
      await removeUserTokenFromDatabase(userId, role); // Remove invalid token
    }
  }
};

module.exports = { sendNotificationToUser };
