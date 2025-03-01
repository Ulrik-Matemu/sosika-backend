const express = require('express');
const router = express.Router();
const pool = require('../db');

// Create order menu item
router.post('/order-menu-items', async (req, res) => {
    try {
        const { order_id, menu_item_id, quantity, price } = req.body;
        const total_amount = quantity * price;

        // Validate quantity
        if (quantity <= 0) {
            return res.status(400).json({
                error: 'Quantity must be greater than 0'
            });
        }

        const result = await pool.query(
            `INSERT INTO order_menu_item (
                order_id, menu_item_id, quantity, price, total_amount
            ) VALUES ($1, $2, $3, $4, $5) 
            RETURNING *`,
            [order_id, menu_item_id, quantity, price, total_amount]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        // Check for unique constraint violation
        if (error.code === '23505') {
            return res.status(400).json({
                error: 'This menu item already exists in the order'
            });
        }
        res.status(500).json({
            error: 'Failed to create order menu item',
            details: error.message
        });
    }
});

// Get all items for a specific order
router.get('/orders/:orderId/menu-items', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        const result = await pool.query(
            `SELECT omi.*, mi.name as item_name, mi.description
             FROM order_menu_item omi
             JOIN menu_item mi ON omi.menu_item_id = mi.id
             WHERE omi.order_id = $1`,
            [orderId]
        );

        res.json(result.rows);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch order menu items',
            details: error.message
        });
    }
});

// Get specific order menu item by ID
router.get('/order-menu-items/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            `SELECT omi.*, mi.name as item_name, mi.description
             FROM order_menu_item omi
             JOIN menu_item mi ON omi.menu_item_id = mi.id
             WHERE omi.id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'Order menu item not found'
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({
            error: 'Failed to fetch order menu item',
            details: error.message
        });
    }
});

// Update order menu item quantity
router.patch('/order-menu-items/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;
        const { quantity } = req.body;

        // Validate quantity
        if (quantity <= 0) {
            return res.status(400).json({
                error: 'Quantity must be greater than 0'
            });
        }

        // First get the current price
        const priceResult = await client.query(
            'SELECT price FROM order_menu_item WHERE id = $1',
            [id]
        );

        if (priceResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                message: 'Order menu item not found'
            });
        }

        const { price } = priceResult.rows[0];
        const total_amount = quantity * price;

        // Update the order menu item
        const result = await client.query(
            `UPDATE order_menu_item 
             SET quantity = $1, total_amount = $2
             WHERE id = $3 
             RETURNING *`,
            [quantity, total_amount, id]
        );

        // Update the total amount in the orders table
        await client.query(
            `UPDATE orders o
             SET total_amount = (
                SELECT SUM(total_amount)
                FROM order_menu_item
                WHERE order_id = o.id
             )
             WHERE id = (
                SELECT order_id
                FROM order_menu_item
                WHERE id = $1
             )`,
            [id]
        );

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({
            error: 'Failed to update order menu item',
            details: error.message
        });
    } finally {
        client.release();
    }
});

// Delete order menu item
router.delete('/order-menu-items/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { id } = req.params;

        // Delete the order menu item
        const result = await client.query(
            'DELETE FROM order_menu_item WHERE id = $1 RETURNING *',
            [id]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({
                message: 'Order menu item not found'
            });
        }

        // Update the total amount in the orders table
        await client.query(
            `UPDATE orders o
             SET total_amount = (
                SELECT COALESCE(SUM(total_amount), 0)
                FROM order_menu_item
                WHERE order_id = o.id
             )
             WHERE id = $1`,
            [result.rows[0].order_id]
        );

        await client.query('COMMIT');
        res.json({ message: 'Order menu item deleted successfully' });
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({
            error: 'Failed to delete order menu item',
            details: error.message
        });
    } finally {
        client.release();
    }
});

// Bulk create order menu items
router.post('/orders/:orderId/menu-items/bulk', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        const { orderId } = req.params;
        const { items } = req.body;

        const createdItems = [];
        
        for (const item of items) {
            const { menu_item_id, quantity, price } = item;
            const total_amount = quantity * price;

            if (quantity <= 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({
                    error: `Invalid quantity for menu item ${menu_item_id}`
                });
            }

            const result = await client.query(
                `INSERT INTO order_menu_item (
                    order_id, menu_item_id, quantity, price, total_amount
                ) VALUES ($1, $2, $3, $4, $5) 
                RETURNING *`,
                [orderId, menu_item_id, quantity, price, total_amount]
            );
            
            createdItems.push(result.rows[0]);
        }

        // Update the total amount in the orders table
        await client.query(
            `UPDATE orders
             SET total_amount = (
                SELECT SUM(total_amount)
                FROM order_menu_item
                WHERE order_id = $1
             )
             WHERE id = $1`,
            [orderId]
        );

        await client.query('COMMIT');
        res.status(201).json(createdItems);
    } catch (error) {
        await client.query('ROLLBACK');
        res.status(500).json({
            error: 'Failed to create order menu items',
            details: error.message
        });
    } finally {
        client.release();
    }
});

module.exports = router;