const express = require('express');
const pool = require('../db');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const JWT_SECRET = process.env.JWT_SECRET;
const getIo = require('../socket').getIo;


router.get('/deliveryPerson', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM delivery_person');
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "No delivery persons found" });
        }
        return res.status(201).json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch delivery persons" });
    }
});


router.post('/deliveryPerson', async (req, res) => {
    const { fullName, phoneNumber, latitude, longitude, transportType, collegeId, password } = req.body;


    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query('INSERT INTO delivery_person (full_name, phone_number, latitude, longitude, transport_type, college_id, password) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [fullName, phoneNumber, latitude, longitude, transportType, collegeId, hashedPassword]
        );
        return res.status(201).json({ message: "Delivery person registered successfully", user: result.rows[0] });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to register delivery person" });
    }
});


router.post('/deliveryPerson/login', async (req, res) => {
    const { fullName, password } = req.body;
    if (!fullName || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }


    try {
        const result = await pool.query('SELECT * FROM delivery_person WHERE full_name = $1', [fullName]);
        if (result.rows.length === 0) {
            return res.status(400).json({ error: "Invalid email or password" });
        }
        const deliveryPerson = result.rows[0];
        const isMatch = await bcrypt.compare(password, deliveryPerson.password);
        if (!isMatch) {
            return res.status(400).json({ error: "Invalid password or email " });
        }
        const token = jwt.sign({ deliveryPersonId: deliveryPerson.id }, JWT_SECRET, { expiresIn: '1h' });
        const deliveryPersonName = deliveryPerson.full_name;
        const deliveryPersonId = deliveryPerson.id;
        const deliveryPersonLatitude = deliveryPerson.latitude;
        const deliveryPersonLongitude = deliveryPerson.longitude;
        return res.status(200).json({ message: "Delivery person login successful", token, deliveryPersonName, deliveryPersonId, deliveryPersonLatitude, deliveryPersonLongitude });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error logging in delivery person" });
    }
});

router.put('/orders/:orderId/accept', async (req, res) => {
    const client = await pool.connect();
    try {
        const { orderId } = req.params;
        const { delivery_person_id } = req.body;

        await client.query('BEGIN');

        // Check if delivery person is already assigned to an active order
        const activeOrderCheck = await client.query(
            `SELECT id FROM orders 
             WHERE delivery_person_id = $1 
             AND order_status IN ('assigned', 'in_progress')`,
            [delivery_person_id]
        );

        if (activeOrderCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'You are already assigned to an active order. Complete or cancel it before accepting a new one.'
            });
        }

        // Check if the order is available to be accepted
        const orderCheck = await client.query(
            `SELECT order_status, vendor_id FROM orders WHERE id = $1`,
            [orderId]
        );

        if (orderCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Order not found' });
        }

        const { order_status, vendor_id } = orderCheck.rows[0];

        if (order_status !== 'pending' && order_status !== 'in_progress') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Order is either already assigned or completed/cancelled. Cannot accept.'
            });
        }

        // Assign the delivery person
        await client.query(
            `UPDATE orders SET order_status = 'assigned', delivery_person_id = $1 WHERE id = $2`,
            [delivery_person_id, orderId]
        );

        await client.query('COMMIT');

        // Emit event to vendor and delivery personnel
        const io = getIo();
        io.to(orderId).emit('orderAssigned', {
            orderId,
            status: 'assigned',
            deliveryPersonId: delivery_person_id
        });

        io.to(`vendor_${vendor_id}`).emit('orderUpdated', {
            orderId,
            status: 'assigned'
        });

        io.to(`delivery_person_${delivery_person_id}`).emit('orderAssigned', {
            orderId,
            status: 'assigned',
            pickup_location,
            dropoff_location
        });

        res.json({ message: 'Order assigned successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: 'Failed to assign order', details: error.message });
    } finally {
        client.release();
    }
});



router.put("/deliveryPerson/:id/toggle-active", async (req, res) => {
    const { id } = req.params;

    try {
        // Get current status
        const result = await pool.query("SELECT is_active FROM delivery_person WHERE id = $1", [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Delivery person not found" });
        }

        const currentStatus = result.rows[0].is_active;
        const newStatus = !currentStatus; // Toggle status

        // Update status in database
        await pool.query("UPDATE delivery_person SET is_active = $1 WHERE id = $2", [newStatus, id]);

        return res.json({ message: "Status updated", is_active: newStatus });
    } catch (error) {
        console.error("Error toggling active status:", error);
        return res.status(500).json({ error: "Server error" });
    }
});

router.put('/deliveryPerson/update-location/:id', async (req, res) => {
    const { id } = req.params;
    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and Longitude are required' });
    }

    try {
        const result = await pool.query(
            'UPDATE delivery_person SET latitude = $1, longitude = $2 WHERE id = $3 RETURNING *',
            [latitude, longitude, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Delivery person not found' });
        }


        res.json({ message: 'Location updated successfully', deliveryPerson: result.rows[0] });
        console.log("Delivery Guy Location updated");
    } catch (error) {
        console.error('Error updating location:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/deliveryPerson/:id/orders', async (req, res) => {
    try {
        const { id } = req.params;

        // Fetch orders assigned to the delivery person
        const result = await pool.query(
            `SELECT id, order_status 
             FROM orders 
             WHERE delivery_person_id = $1 AND order_status IN ('assigned', 'in_progress') 
             ORDER BY id DESC`,
            [id]
        );

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch assigned orders' });
    }
});


router.put('/deliveryPerson/:id', async (req, res) => {
    const { id } = req.params;
    const { fullName, phoneNumber, email, password } = req.body;



    const fields = [];
    const values = [];

    let query = 'UPDATE delivery_person SET ';

    if (fullName) {
        fields.push('full_name');
        values.push(fullName);
    }

    if (phoneNumber) {
        fields.push('phone_number');
        values.push(phoneNumber);
    }

    if (email) {
        fields.push('email');
        values.push(email);
    }



    if (fields.length === 0) {
        return res.status(400).json({ error: 'No field to update' });
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
            return res.status(404).json({ error: 'Delivery Person not found' });
        }

        return res.status(200).json({ message: 'Profile Updated Successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error updating profile' });
    }
});


router.get('/deliveryPerson/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('SELECT * FROM delivery_person WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Delivery Person not found" });
        }
        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error fetching delivery person details" });
    }
});




module.exports = router;