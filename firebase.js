require('dotenv').config();
const admin = require('firebase-admin');

// Load service account credentials
const firebaseConfig = JSON.parse(Buffer.from(process.env.FIREBASE_CONFIG, 'base64').toString('utf8'));

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(firebaseConfig),
});

module.exports = admin;
