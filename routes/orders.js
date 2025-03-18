const express = require('express');
const router = express.Router();
const pool = require('../db'); // Assuming you have PostgreSQL connection pool setup
const getIo = require('../socket').getIo;
require('dotenv').config();
const { sendVendorNotification } = require('../index');



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

        // Calculate total amount based on ordered menu items
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

        // Insert order items
        for (const item of order_items) {
            await client.query(
                `INSERT INTO order_menu_item (
                    order_id, menu_item_id, quantity, price, total_amount
                ) VALUES ($1, $2, $3, $4, $5)`,
                [orderId, item.menu_item_id, item.quantity, item.price, item.quantity * item.price]
            );
        }

        if (vendor_id) {
            await sendVendorNotification(
              vendor_id,
              'New Order Received',
              `Order #${orderId}`,
              `/vendor/orders/${orderId}`
            );
          }

        await client.query('COMMIT');
        res.status(201).json({
            message: 'Order created successfully',
            order_id: orderId
        });
    } catch (error) {
        await client.query('ROLLBACK');
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

        res.json(orderResult.rows[0]);
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

        let query = `
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

        query += ` GROUP BY o.id ORDER BY o.order_datetime DESC`;

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
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