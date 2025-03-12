const admin = require('./firebase'); // Firebase instance
const { getToken } = require('./tokenStore'); // Import Redis token retrieval function

const sendNotificationToUser = async (userId, title, body) => {
  try {
    const deviceToken = await getToken(userId);
    if (!deviceToken) {
      console.log(`No FCM token found for user ${userId}`);
      return;
    }

    const message = {
      notification: { title, body },
      token: deviceToken,
    };

    const response = await admin.messaging().send(message);
    console.log(`Notification sent to user ${userId}:`, response);
  } catch (error) {
    console.error(`Error sending notification to user ${userId}:`, error);
  }
};

module.exports = { sendNotificationToUser };
