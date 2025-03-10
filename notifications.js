const admin = require('./firebase'); // Import Firebase instance

const sendNotification = async (deviceToken, title, body) => {
  const message = {
    notification: { title, body },
    token: deviceToken,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Notification sent:', response);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
};

module.exports = { sendNotification };
