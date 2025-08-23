const express = require('express');
const router = express.Router();
const pool = require('../db'); // Assuming you have PostgreSQL connection pool setup
const getIo = require('../socket').getIo;
require('dotenv').config();
const nodemailer = require('nodemailer');
const { sendNotificationToUser } = require('../notifications');
const { getToken } = require('../tokenStore'); // Assuming you have a token store module


// Define this first, before any route like /orders/:id
router.post('/orders/other-orders', async (req, res) => {
    try {
        const { userId, itemName, extraInstructions, quantity } = req.body;

        if (!userId || !itemName || !quantity) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        const dbResult = await pool.query(
            'INSERT INTO other_orders (user_id, item_name, extra_instructions, quantity) VALUES ($1, $2, $3, $4) RETURNING *',
            [userId, itemName, extraInstructions, quantity]
        );

        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });

        await transporter.sendMail({
            to: process.env.EMAIL_USER,
            subject: "New Order has been made, but not from the menu",
            text: `User: ${userId} has placed an order. They want ${quantity} of "${itemName}" with extra instructions: "${extraInstructions}."`,
        });



        return res.status(201).json({
            success: true,
            order: dbResult.rows[0]
        });
    } catch (error) {
        console.error('Error creating other order:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create other order',
            error: error.message
        });
    }
});

router.get('/orders/other-orders', async (req, res) => {
    try {
        const dbResult = await pool.query('SELECT * FROM other_orders');
        return res.status(200).json({
            success: true,
            orders: dbResult.rows
        });
    } catch (error) {
        console.error('Error fetching other orders:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch other orders',
            error: error.message
        });
    }
});


router.post('/orders', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            user_id,
            vendor_id,
            delivery_fee,
            requested_datetime,
            requested_asap,
            order_items
        } = req.body;

        // Calculate total amount
        let totalItemsAmount = 0;
        for (const item of order_items) {
            totalItemsAmount += item.quantity * item.price;
        }
        const total_amount = totalItemsAmount + delivery_fee;

        // Insert order
        const orderResult = await client.query(
            `INSERT INTO orders (
        user_id, vendor_id, order_status, delivery_fee, 
        total_amount, requested_datetime, requested_asap
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [user_id, vendor_id, 'pending', delivery_fee, total_amount, requested_datetime, requested_asap]
        );

        const orderId = orderResult.rows[0].id;

        // Get vendor’s linked user_id
        const vendorUserResult = await client.query(
            `SELECT v.user_id 
       FROM vendors v
       INNER JOIN orders o ON v.id = o.vendor_id
       WHERE o.id = $1`,
            [orderId]
        );
        const vendorUserId = vendorUserResult.rows[0]?.user_id;

        // Get customer (order creator)
        const userResult = await client.query(
            `SELECT user_id FROM orders WHERE id = $1`,
            [orderId]
        );
        const userId = userResult.rows[0].user_id;

        console.log(`Order created with ID: ${orderId}, Vendor User ID: ${vendorUserId}, User ID: ${userId}`);

        // Insert order items
        for (const item of order_items) {
            await client.query(
                `INSERT INTO order_menu_item (
          order_id, menu_item_id, quantity, price, total_amount
        ) VALUES ($1, $2, $3, $4, $5)`,
                [orderId, item.menu_item_id, item.quantity, item.price, item.quantity * item.price]
            );
        }

        await client.query('COMMIT');

        // ✅ Get vendor email
        const vendorEmailResult = await client.query(
            `SELECT email FROM "user" WHERE id = $1`,
            [vendorUserId]
        );
        const vendorEmail = vendorEmailResult.rows[0]?.email;

        // ✅ Send email
        if (vendorEmail) {
            const transporter = nodemailer.createTransport({
                service: "gmail",
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS,
                },
            });

            await transporter.sendMail({
                to: vendorEmail,
                subject: "New Order!",
                text: `A new order has been placed with ID: ${orderId}.`,
            });
        }

        // ✅ Send push notification
        if (vendorUserId) {
            sendNotificationToUser(
                vendorUserId,
                "user",
                "You have a new Order!",
                `User: ${userId} has placed an order.`
            );
        }

        // Send API response last
        res.status(201).json({
            message: 'Order created successfully',
            order_id: orderId
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Order creation failed:", error);
        res.status(500).json({
            error: 'Failed to create order',
            details: error.message
        });
    } finally {
        client.release();
    }
});



// Get order by ID
router.get('/orders/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const orderResult = await pool.query(
            `SELECT o.*, 
                    CAST(v.geolocation AS TEXT) AS pickup_location,
                    CAST(u.custom_address AS TEXT) AS dropoff_location,
                    json_agg(json_build_object(
                        'id', omi.id,
                        'menu_item_id', omi.menu_item_id,
                        'quantity', omi.quantity,
                        'price', omi.price,
                        'total_amount', omi.total_amount
                    )) AS items
             FROM orders o
             LEFT JOIN order_menu_item omi ON o.id = omi.order_id
             LEFT JOIN vendor v ON o.vendor_id = v.id
             LEFT JOIN "user" u ON o.user_id = u.id
             WHERE o.id = $1
             GROUP BY o.id, pickup_location, dropoff_location`,
            [id]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        let userPhone = null;

        const userResult = await pool.query(
            `SELECT phone_number FROM "user" WHERE id = $1`,
            [orderResult.rows[0].user_id]
        )

        if (userResult.rows.length > 0) {
            userPhone = userResult.rows[0].phone_number;
        } else {
            console.log('Phone number not found');
        }

        const orderData = orderResult.rows[0];
        orderData.user_phone = userPhone; // Add user phone number to the order data

        res.json(orderData);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch order',
            details: error.message
        });
    }
});




router.get('/orders/vendor/:vendorId', async (req, res) => {
    const { vendorId } = req.params;
    const { status } = req.query;

    try {
        let query = 'SELECT * FROM orders WHERE vendor_id = $1';
        let values = [vendorId];

        if (status) {
            query += ' AND order_status = $2';
            values.push(status);
        }

        const { rows } = await pool.query(query, values);
        res.json(rows);
    } catch (error) {
        console.error('Error fetching vendor orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

router.patch('/orders/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { order_status } = req.body;

        // Update order status
        const result = await pool.query(
            `UPDATE orders 
             SET order_status = $1 
             WHERE id = $2 
             RETURNING vendor_id, user_id, delivery_person_id`,
            [order_status, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const { vendor_id, user_id, delivery_person_id } = result.rows[0];
        const io = getIo();

        let pickup_location = null;
        let dropoff_location = null;

        // Fetch Vendor Geolocation (Pickup Point)
        const vendorResult = await pool.query(
            `SELECT geolocation FROM vendor WHERE id = $1`,
            [vendor_id]
        );

        if (vendorResult.rows.length > 0) {
            pickup_location = vendorResult.rows[0].geolocation; // POINT(x y)
        }

        // Fetch User Geolocation (Dropoff Point)
        const userResult = await pool.query(
            `SELECT geolocation FROM "user" WHERE id = $1`,
            [user_id]
        );

        if (userResult.rows.length > 0) {
            dropoff_location = userResult.rows[0].geolocation; // POINT(x y)
        }

        // Notify vendor when order is in progress
        // Notify all active delivery personnel about the new order
        if (order_status === 'in_progress') {
            io.to(`vendor_${vendor_id}`).emit('orderUpdated', {
                orderId: id,
                status: 'in_progress'
            });
            sendNotificationToUser(user_id, 'Order Update', `Your order #${id} is in progress`);


            // Fetch only active delivery personnel
            const activeDeliveryPersons = await pool.query(
                `SELECT id FROM delivery_person WHERE is_active = true`
            );

            if (activeDeliveryPersons.rows.length > 0) {
                io.to('delivery_persons').emit('newOrderAvailable', {
                    orderId: id,
                    status: 'in_progress',
                    pickup_location,
                    dropoff_location
                });
            }
        }


        // Notify assigned delivery person only if the order is assigned or completed
        if (delivery_person_id) {
            if (order_status === 'assigned') {
                io.to(`delivery_${delivery_person_id}`).emit('orderAssigned', {
                    orderId: id,
                    status: 'assigned',
                    pickup_location,
                    dropoff_location
                });
            } else if (order_status === 'completed') {
                io.to(`delivery_${delivery_person_id}`).emit('orderCompleted', {
                    orderId: id,
                    status: 'completed'
                });
            }
        }

        res.json({ orderId: id, status: order_status, pickup_location, dropoff_location });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update order status', details: error.message });
    }
});



// Add ratings
router.patch('/orders/:id/ratings', async (req, res) => {
    try {
        const { id } = req.params;
        const { delivery_rating, vendor_rating } = req.body;

        const result = await pool.query(
            `UPDATE orders 
             SET delivery_rating = $1, vendor_rating = $2 
             WHERE id = $3 
             RETURNING *`,
            [delivery_rating, vendor_rating, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Order not found' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to add ratings',
            details: error.message
        });
    }
});


// Get all orders with filtering options
router.get('/orders', async (req, res) => {
    try {
        const {
            user_id,
            vendor_id,
            delivery_person_id,
            status,
            from_date,
            to_date
        } = req.query;

        // Join orders with order_menu_item and user to get items and user's phone
        let query = `
      SELECT o.*, u.phone_number,
             json_agg(json_build_object(
               'id', omi.id,
               'menu_item_id', omi.menu_item_id,
               'quantity', omi.quantity,
               'price', omi.price,
               'total_amount', omi.total_amount
             )) as items
      FROM orders o
      LEFT JOIN order_menu_item omi ON o.id = omi.order_id
      LEFT JOIN "user" u ON o.user_id = u.id
      WHERE 1=1
    `;

        const params = [];
        let paramCount = 1;

        if (user_id) {
            query += ` AND o.user_id = $${paramCount}`;
            params.push(user_id);
            paramCount++;
        }

        if (vendor_id) {
            query += ` AND o.vendor_id = $${paramCount}`;
            params.push(vendor_id);
            paramCount++;
        }

        if (delivery_person_id) {
            query += ` AND o.delivery_person_id = $${paramCount}`;
            params.push(delivery_person_id);
            paramCount++;
        }

        if (status) {
            query += ` AND o.order_status = $${paramCount}`;
            params.push(status);
            paramCount++;
        }

        if (from_date) {
            query += ` AND o.order_datetime >= $${paramCount}`;
            params.push(from_date);
            paramCount++;
        }

        if (to_date) {
            query += ` AND o.order_datetime <= $${paramCount}`;
            params.push(to_date);
            paramCount++;
        }

        query += ` GROUP BY o.id, u.phone_number ORDER BY o.order_datetime DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Failed to fetch orders:', error);
        res.status(500).json({
            error: 'Failed to fetch orders',
            details: error.message
        });
    }
});


router.get("/orders/:orderId/status", async (req, res) => {
    try {
        const { orderId } = req.params;

        // Fetch order details
        const orderResult = await pool.query(
            "SELECT order_status, delivery_person_id FROM orders WHERE id = $1",
            [orderId]
        );

        if (orderResult.rows.length === 0) {
            return res.status(404).json({ error: "Order not found" });
        }

        const status = orderResult.rows[0].order_status;
        const delivery_person_id = orderResult.rows[0].delivery_person_id;

        if (!delivery_person_id) {
            return res.json({ status, delivery_location: null }); // No assigned delivery person
        }

        // Fetch delivery person's location
        const deliveryPersonResult = await pool.query(
            "SELECT latitude, longitude FROM delivery_person WHERE id = $1",
            [delivery_person_id]
        );

        if (deliveryPersonResult.rows.length === 0) {
            return res.json({ status, delivery_location: null }); // Delivery person not found
        }

        const latitude = deliveryPersonResult.rows[0].latitude;
        const longitude = deliveryPersonResult.rows[0].longitude;

        return res.json({
            status,
            delivery_location: { lat: latitude, lng: longitude },
        });

    } catch (error) {
        console.error("Error fetching order status:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});


router.get('/orders/in-progress/unassigned', async (req, res) => {
    try {
        const query = `
            SELECT o.*, 
                   json_agg(json_build_object(
                       'id', omi.id,
                       'menu_item_id', omi.menu_item_id,
                       'quantity', omi.quantity,
                       'price', omi.price,
                       'total_amount', omi.total_amount
                   )) as items
            FROM orders o
            LEFT JOIN order_menu_item omi ON o.id = omi.order_id
            WHERE o.order_status = 'in_progress' AND o.delivery_person_id IS NULL
            GROUP BY o.id
            ORDER BY o.order_datetime DESC
        `;

        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch in-progress orders',
            details: error.message
        });
    }
});



module.exports = router;