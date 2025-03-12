require('dotenv').config();
const admin = require('firebase-admin');

// Load service account credentials
const serviceAccount = require(process.env.FIREBASE_CONFIG);  // Ensure this file is in `.gitignore`

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

module.exports = admin;
