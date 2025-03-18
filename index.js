require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { initSocket } = require('./socket');
const PORT = process.env.PORT || 3001;
const app = express();
const http = require('http');
const webPush = require('web-push');
const server = http.createServer(app);
const webPush = require('web-push');
const { createClient } = require('redis');

initSocket(server); // Initialize the socket here
// Create Redis client
const redisClient = createClient({
    url: process.env.REDIS_URL
  });
  
  // Connect to Redis
  (async () => {
    redisClient.on('error', (err) => console.log('Redis Client Error', err));
    await redisClient.connect();
    console.log('Connected to Redis');
  })();
  
  // VAPID keys should be stored in environment variables
  const publicVapidKey = process.env.WEBP_PUBLIC_KEY;
  const privateVapidKey = process.env.WEBP_PRIVATE_KEY;
  
  // Configure web-push
  webPush.setVapidDetails(
    'mailto:ulrikjosephat@gmail.com', // Change to your email
    publicVapidKey,
    privateVapidKey
  );
  
  // Route to send the public key to clients
  app.get('/api/push/public-key', (req, res) => {
    res.json({ publicKey: publicVapidKey });
  });
  
  // Route to subscribe to push notifications
  app.post('/api/push/subscribe', async (req, res) => {
    const { subscription, vendorId } = req.body;
    
    if (!subscription || !vendorId) {
      return res.status(400).json({ error: 'Missing subscription or vendorId' });
    }
    
    try {
      // Get existing subscriptions for this vendor
      const key = `push:vendor:${vendorId}`;
      let subscriptions = [];
      
      const existingData = await redisClient.get(key);
      if (existingData) {
        subscriptions = JSON.parse(existingData);
      }
      
      // Check if subscription already exists
      const exists = subscriptions.some(sub => 
        sub.endpoint === subscription.endpoint
      );
      
      if (!exists) {
        // Add new subscription
        subscriptions.push(subscription);
        
        // Store updated subscriptions
        await redisClient.set(key, JSON.stringify(subscriptions));
      }
      
      res.status(201).json({ message: 'Subscription added successfully' });
    } catch (error) {
      console.error('Error storing subscription:', error);
      res.status(500).json({ error: 'Failed to store subscription' });
    }
  });
  
  // Function to send push notification to a specific vendor
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

const authRouter = require('./routes/auths');
const { googleAuth } = require('./routes/google-auth');
const collegeRouter = require('./routes/colleges');
const vendorRouter = require('./routes/vendor');
const menuItemRouter = require('./routes/menuItems');
const deliveryPersonRouter = require('./routes/deliveryPerson');
const ordersRouter = require("./routes/orders");
const orderMenuItemsRouter = require("./routes/orderMenuItems");

app.use(cors());
app.use(express.json({ limit: "50mb" })); // Increase limit for JSON
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Increase limit for form data
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.get('/', (req, res) => {
    res.status(200).json({
        message: "Hello there, sosika backend here"
    });
});

app.use('/api/auth', authRouter);
app.use('/api/', collegeRouter);
app.use('/api/', vendorRouter);
app.use('/api/', menuItemRouter);
app.use('/api/', deliveryPersonRouter);
app.use("/api/", ordersRouter);
app.use("/api/", orderMenuItemsRouter);


module.exports = { sendVendorNotification };

server.listen(PORT, () => {
    console.log(`Sosika backend running on port ${PORT}`);
});


