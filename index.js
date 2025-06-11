require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { initSocket } = require('./socket');
const PORT = process.env.PORT || 3001;
const app = express();
const http = require('http');
const server = http.createServer(app);
const webPush = require('web-push');
const { createClient } = require('redis');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const { groupByNormalizedPhone } = require('./utils/duplicatePhoneUtil');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests, please try again later.",
})

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


const authRouter = require('./routes/auths');
const { googleAuth } = require('./routes/google-auth');
const collegeRouter = require('./routes/colleges');
const vendorRouter = require('./routes/vendor');
const menuItemRouter = require('./routes/menuItems');
const deliveryPersonRouter = require('./routes/deliveryPerson');
const ordersRouter = require("./routes/orders");
const orderMenuItemsRouter = require("./routes/orderMenuItems");
const aiRecommendationRouter = require("./routes/aiReccomendationRoutes");
const { text } = require('body-parser');

app.use(cors({
    origin: [
      "https://sosika.netlify.app",
      "https://ulrik-matemu.github.io",
      "https://sosikavendor.netlify.app",
      "https://sosikaadmin.netlify.app",
      "http://localhost:5173",
      "http://localhost:5174",
      "https://sosikadelivery.netlify.app",
    ],
    credentials: true
  }));
  
app.use(limiter); // Apply rate limiting to all requests
app.use(helmet()); // Use helmet for security
app.use(express.json({ limit: "50mb" })); // Increase limit for JSON
app.use(express.urlencoded({ limit: "50mb", extended: true })); // Increase limit for form data
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.get('/', (req, res) => {
    res.status(200).json({
        message: "Hello there, sosika backend here"
    });
});


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


app.use('/api/auth', authRouter);
app.use('/api/', collegeRouter);
app.use('/api/', vendorRouter);
app.use('/api/', menuItemRouter);
app.use('/api/', deliveryPersonRouter);
app.use("/api/", ordersRouter);
app.use("/api/", orderMenuItemsRouter);
app.use("/api/", aiRecommendationRouter);


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function fetchUsers() {
  const result = await pool.query(`
    SELECT id, email, phone_number FROM "user"
    WHERE phone_number IS NOT NULL
    AND (
      last_notified IS NULL OR last_notified < NOW() - INTERVAL '3 days'
    )
  `);
  return result.rows;
}


async function sendEmail(user) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: user.email,
    subject: 'Please Update Your Phone Number',
    text: `Hi,\n\nWe noticed your phone number might be similar to another user's. Please update it in your profile to help us improve customer service.\n\nThanks,\nSosika Team`
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${user.email}`);

    // Update last_notified
    await pool.query('UPDATE "user" SET last_notified = NOW() WHERE id = $1', [user.id]);
  } catch (err) {
    console.error(`❌ Failed to send email to ${user.email}:`, err.message);
  }
}



// Main task
async function processUser() {
    const users = await fetchUsers();
    const duplicates = groupByNormalizedPhone(users);

    for (const group of duplicates) {
        for (const user of group) {
            await sendEmail(user);
        }
    }
}


cron.schedule('20 11 * * *', () => {
    console.log('🕙 Running duplicate phone number check...');
    processUser();
});




server.listen(PORT, () => {
    console.log(`Sosika backend running on port ${PORT}`);
});


