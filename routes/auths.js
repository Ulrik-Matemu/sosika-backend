const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET;

router.post('/register', async (req, res) => {
    const { lat, lng, address } = req.body.customAddress;
if (!lat || !lng || !address) {
    return res.status(400).json({ error: "Valid location is required" });
}

const point = `(${lat}, ${lng})`;

    const { fullName, email, phoneNumber, collegeId, regNumber,  password } = req.body;
    if (!fullName || !email || !phoneNumber || !collegeId || !regNumber  || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO "user" (full_name, email, phone_number, college_id, college_registration_number, custom_address, password) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [fullName, email, phoneNumber, collegeId, regNumber, point, hashedPassword]
        );
        res.status(201).json({ message: "User registered successfully", user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to register user" });
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }
    try {
        const result = await pool.query('SELECT * FROM "user" WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const user = result.rows[0];
        console.log(user.password);
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '1h' });
        res.status(200).json({ message: "Login successful", userId: user.id });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to login"});
    }
});


router.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM "user"');
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "No users found"});
        }
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch users"});
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
    const { fullName, email, phoneNumber, collegeId, regNumber, password, customAddress } = req.body;

    if (!fullName || !email || !phoneNumber || !collegeId || !regNumber) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        let hashedPassword;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        const result = await pool.query(
            'UPDATE "user" SET full_name = $1, email = $2, phone_number = $3, college_id = $4, college_registration_number = $5, password = COALESCE($6, password), custom_address = $7 WHERE id = $8 RETURNING *',
            [fullName, email, phoneNumber, collegeId, regNumber, hashedPassword, customAddress, userId]
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
router.post("/update-location", (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "http://localhost:5173");
    res.header("Access-Control-Allow-Methods", "POST");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
}, async (req, res) => {
    try {
        const { userId, custom_address } = req.body;

        if (!userId || !custom_address) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const { lat, lng } = custom_address;

        const query = `
            UPDATE public."user"
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



module.exports = router;