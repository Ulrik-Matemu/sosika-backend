const admin = require('firebase-admin');

// Load service account credentials
const serviceAccount = require('./sosika-101-firebase-adminsdk-fbsvc-59254c2f39.json');  // Ensure this file is in `.gitignore`

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
