const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const pool = require('../db');
const router = express.Router();
const { saveToken } = require('../tokenStore');
const { sendNotificationToUser } = require('../notifications');
const { googleAuth } = require('./google-auth');
const body = require('express-validator').body;
const validationResult = require('express-validator').validationResult;


const JWT_SECRET = process.env.JWT_SECRET;


router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, phoneNumber, password } = req.body;
    const referredBy = parseInt(req.query.ref) || 0; // 👈 get from query string

    try {
      const existingUser = await pool.query(
        'SELECT * FROM "user" WHERE email = $1',
        [email]
      );
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      const existingPhone = await pool.query(
        'SELECT * FROM "user" WHERE phone_number = $1',
        [phoneNumber]
      );
      if (existingPhone.rows.length > 0) {
        return res.status(400).json({ error: 'Phone number already exists' });
      }

      // Optional: Validate that the referral ID exist
      if (referredBy !== 0) {
        const refCheck = await pool.query(
          'SELECT id FROM "user" WHERE id = $1',
          [referredBy]
        );
        if (refCheck.rows.length === 0) {
          return res.status(400).json({ error: 'Invalid referral code' });
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO "user" (
            full_name,
            email,
            phone_number,
            college_id,
            college_registration_number,
            custom_address,
            password,
            referred_by
          ) VALUES (
            'Not-Provided',
            $1,
            $2,
            1,
            'ADD_TO_BE_VERIFIED',
            point(0,0),
            $3,
            $4
          )
          RETURNING *`,
        [email, phoneNumber, hashedPassword, referredBy]
      );

      res.status(201).json({
        message: 'User registered successfully',
        user: result.rows[0],
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to register user' });
    }
  }
);


router.post(
  '/login',
  [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      const result = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

      res.status(200).json({ message: 'Login successful', userId: user.id, token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to login' });
    }
  }
);

router.post('/admin', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // Check credentials (hardcoded for now)
    if (email !== "ulrikjosephat@gmail.com" || password !== "passXLV123") {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    // No need for admin.id - just create a simple admin payload
    const adminPayload = { role: 'admin', email };

    const token = jwt.sign(adminPayload, JWT_SECRET, { expiresIn: '1h' });

    res.status(200).json({
      message: "Login successful",
      token
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to login" });
  }
});

router.post('/fcm-token', async (req, res) => {
  const { fcmToken, userId, role } = req.body;

  if (!fcmToken || !userId || !role) {
    return res.status(400).json({ error: "Missing required fields: fcmToken, userId, or role." });
  }

  const validRoles = ['user', 'vendor', 'deliveryPerson'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: "Invalid role provided." });
  }

  // Determine the table based on role
  const tableName = role === 'user' ? 'user'
                  : role === 'vendor' ? 'vendor'
                  : 'delivery_person';

  try {
    const result = await pool.query(`SELECT * FROM "${tableName}" WHERE id = $1`, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `${role} not found` });
    }

    // Save the token in your database or Redis
    await saveToken(userId, fcmToken, role); // Modify saveToken to handle role if needed

    res.status(200).json({ message: "FCM token saved successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save FCM token" });
  }
});



router.get('/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "user"');
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "No users found" });
    }
    return res.status(200).json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.get('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query('SELECT * FROM "user" WHERE id = $1', [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// Add this route to update user profile
router.put('/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  const { full_name, email, phone_number, college_id, college_registration_number, password } = req.body;


  if (!full_name) {
    return res.status(400).json({ error: "Full name is required" });
  }

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  if (!phone_number) {
    return res.status(400).json({ error: "Phone number is required" });
  }

  if (!college_id) {
    return res.status(400).json({ error: "College ID is required" });
  }

  if (!college_registration_number) {
    return res.status(400).json({ error: "College registration number is required" });
  }

  try {
    let hashedPassword;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const result = await pool.query(
      'UPDATE "user" SET full_name = $1, email = $2, phone_number = $3, college_id = $4, college_registration_number = $5, password = COALESCE($6, password) WHERE id = $7 RETURNING *',
      [full_name, email, phone_number, college_id, college_registration_number, password, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ message: "Profile updated successfully", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});



// Update user's custom address
router.post("/update-location", async (req, res) => {
  try {
    const { userId, custom_address } = req.body;

    if (!userId || !custom_address) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const { lat, lng } = custom_address;

    const query = `
            UPDATE "user"
            SET custom_address = point($1, $2)
            WHERE id = $3
            RETURNING id, custom_address;
        `;

    const result = await pool.query(query, [lat, lng, userId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "Location updated", user: result.rows[0] });
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ message: "Server error" });
  }
});


router.get('/users/location', async (req, res) => {
  try {
    const userId = req.query.userId; // Assuming userId is passed as a query parameter
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const result = await pool.query(
      `SELECT CAST(custom_address AS TEXT) AS custom_address FROM "user" WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const customAddress = result.rows[0].custom_address; // e.g., "(37.7749,-122.4194)"
    const [lat, lng] = customAddress.replace(/[()]/g, "").split(",");

    res.json({ lat: parseFloat(lat), lng: parseFloat(lng) });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch user location',
      details: error.message
    });
  }
});

router.post('/reviews', async (req, res) => {
  const { user_id, review_text } = req.body;

  if (!user_id || !review_text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO reviews (user_id, review_text)
         VALUES ($1, $2) RETURNING *`,
      [user_id, review_text]
    );

    res.status(201).json({ review: result.rows[0], message: 'Review submitted successfully' });
  } catch (error) {
    console.error('Error submitting review:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/reviews', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM reviews');
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


router.post('/google/', googleAuth);

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const result = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    const resetToken = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });

    // Send notification to user
    const resetLink = `https://sosika.netlify.app/#/reset-password?token=${resetToken}`;
    const transporter = nodemailer.createTransport({
      service: "gmail", // or your email service
      auth: {
        user: process.env.EMAIL_USER, // your email address
        pass: process.env.EMAIL_PASS, // your email password or app password
      },
    });

    // 3. Send email
    await transporter.sendMail({
      to: user.email,
      subject: "Reset your Sosika password",
      html: `
        <h2>Reset Password</h2>
        <p>Click below to reset your password. This link will expire in 1 hour.</p>
        <a href="${resetLink}">Reset Password</a>
      `,
    });

    res.status(200).json({ message: "Password reset link sent to your email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send password reset link" });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Token and new password are required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await pool.query(
      'UPDATE "user" SET password = $1 WHERE id = $2 RETURNING *',
      [hashedPassword, decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(200).json({ message: "Password reset successfully", user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to reset password" });
  }
});


router.get('/referral/check', async (req, res) => {
  const { user_id, target } = req.query;

  if (!user_id || !target) {
    return res.status(400).json({ error: 'Missing user_id or target' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM "user" WHERE referred_by = $1',
      [user_id]
    );

    const referralCount = result.rows.length;
    const targetReached = referralCount >= parseInt(target, 10);

    res.json({
      user_id: user_id,
      referral_count: referralCount,
      target_reached: targetReached
    });
  } catch (error) {
    console.error('Error checking referrals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/delivery/:vendorId', async (req, res) => {
  const vendorId = req.params.vendorId;
  try {
    const result = await pool.query(
      'SELECT geolocation FROM vendor WHERE id = $1',
      [vendorId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    res.status(200).json({ geolocation: result.rows[0].geolocation });
  } catch (error) {
    console.error('Error fetching vendor geolocation:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;