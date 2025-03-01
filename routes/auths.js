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

module.exports = router;