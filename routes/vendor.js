const express = require('express');
const pool = require('../db');
const router = express.Router();
const bcrypt = require('bcryptjs');
const JWT_SECRET = process.env.JWT_SECRET;
const jwt = require('jsonwebtoken');
const e = require('express');
require('dotenv').config();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Temporary local storage folder
const cloudinary = require('../cloudinary');
const fs = require('fs');


router.post('/vendor/register', async (req, res) => {
    const { name, ownerName, collegeId, geolocation, password } = req.body;

    if (!name || !ownerName || !collegeId || !geolocation || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query('INSERT INTO vendor (name, owner_name, college_id, geolocation, password) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, ownerName, collegeId, geolocation, hashedPassword]
        );
        return res.status(201).json({ message: "Vendor registered successfully", user: result.rows[0] });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error registering vendor" });
    }
});


router.post('/vendor/login', async (req, res) => {
    const { name, password } = req.body;

    if (!name || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        const result = await pool.query('SELECT * FROM vendor WHERE name = $1', [name]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Invalid name or password" });
        }
        const vendor = result.rows[0];
        const isMatch = await bcrypt.compare(password, vendor.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid password or name" });
        }
        const token = jwt.sign({ vendorId: vendor.id }, JWT_SECRET, { expiresIn: '1h' });
        const vendorName = vendor.name;
        const vendorId = vendor.id;
        return res.status(200).json({ message: "Vendor login successful", token, vendorName, vendorId });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error logging in Vendor" });
    }
});

router.get('/vendor', async (req, res) => {
    const { lat, lng, radius } = req.query;

    try {
        if (lat && lng && radius) {
            const result = await pool.query(
                `SELECT * FROM vendor 
                 WHERE earth_box(ll_to_earth($1::float, $2::float), $3::float) @> ll_to_earth(geolocation[0], geolocation[1])`,
                [lat, lng, radius] // radius in meters
            );
            return res.status(200).json(result.rows);
        } else {
            const result = await pool.query('SELECT * FROM vendor');
            return res.status(200).json(result.rows);
        }
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error fetching vendor" });
    }
});

router.get('/vendor/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM vendor WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Vendor not found" });
        }
        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error fetching vendor" });
    }
});


router.put('/vendor/:id', async (req, res) => {
    const { id } = req.params;
    const { name, ownerName, collegeId, geolocation, password } = req.body;

    let hashedPassword;
    if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
    }

    // Build the update query dynamically
    const fields = [];
    const values = [];
    let query = 'UPDATE vendor SET ';

    if (name) {
        fields.push('name');
        values.push(name);
    }
    if (ownerName) {
        fields.push('owner_name');
        values.push(ownerName);
    }
    if (collegeId) {
        fields.push('college_id');
        values.push(collegeId);
    }

    let pointValue = null;
    if (geolocation?.x && geolocation?.y) {
        pointValue = `(${geolocation.x},${geolocation.y})`;
    }

    if (geolocation) {
        fields.push('geolocation');
        values.push(pointValue);
    }
    if (password) {
        fields.push('password');
        values.push(hashedPassword);
    }

    if (fields.length === 0) {
        return res.status(400).json({ error: "No fields to update" });
    }

    fields.forEach((field, index) => {
        query += `${field} = $${index + 1}`;
        if (index < fields.length - 1) {
            query += ', ';
        }
    });

    query += ` WHERE id = $${fields.length + 1} RETURNING *`;
    values.push(id);

    try {
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Vendor not found" });
        }

        return res.status(200).json({ message: "Vendor updated successfully", vendor: result.rows[0] });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error updating vendor" });
    }
});




router.put('/orders/:orderId/confirm', async (req, res) => {
    const client = await pool.connect();
    try {
        const { orderId } = req.params;

        await client.query('BEGIN');

        // Check if order has been assigned to a delivery person
        const orderCheck = await client.query(
            `SELECT order_status, delivery_person_id FROM orders WHERE id = $1`,
            [orderId]
        );

        if (orderCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (!orderCheck.rows[0].delivery_person_id) {
            return res.status(400).json({ error: 'No delivery person assigned yet' });
        }

        if (orderCheck.rows[0].order_status !== 'assigned') {
            return res.status(400).json({ error: 'Order is not in assigned state' });
        }

        // Confirm the order
        await client.query(
            `UPDATE orders SET order_status = 'vendor_confirmed' WHERE id = $1`,
            [orderId]
        );

        await client.query('COMMIT');
        res.json({ message: 'Order confirmed by vendor' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to confirm order', details: error.message });
    } finally {
        client.release();
    }
});

router.post('/vendors/:id/logo', upload.single('logo'), async (req, res) => {
    const vendorId = req.params.id;

    if (!req.file) {
        return res.status(400).json({ error: "No logo image uploaded" });
    }

    const client = await pool.connect();

    try {
        // Upload image to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'vendor-logos',
            use_filename: true,
            unique_filename: false,
        });

        // Remove the temp file
        fs.unlinkSync(req.file.path);

        // Update vendor record with logo_url
        const updateResult = await client.query(
            'UPDATE vendor SET logo_url = $1 WHERE id = $2 RETURNING *',
            [result.secure_url, vendorId]
        );

        if (updateResult.rows.length === 0) {
            return res.status(404).json({ error: "Vendor not found" });
        }

        res.json({
            message: "Logo uploaded successfully",
            vendor: updateResult.rows[0],
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to upload logo" });
    } finally {
        client.release();
    }
});


// GET /api/users/:id
router.get('/user-vendor/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT id, is_vendor FROM public.user WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});


router.get('/user-vendor', async (req, res) => {
    const { userId } = req.query;

    if (!userId) return res.status(400).json({ error: 'Missing userId' });

    try {
        const result = await pool.query('SELECT * FROM public.vendor WHERE user_id = $1', [userId]);
        res.json(result.rows); // return array for easier handling
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});



module.exports = router;