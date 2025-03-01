const express = require('express');
const pool = require('../db');
const router = express.Router();
const multer = require('multer');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const path = require('path');

const storage = multer.diskStorage(
    {
        destination: "uploads/",
        filename: (req, file, cb) => {
            cb(null, Date.now() + path.extname(file.originalname));
        },
    }
);
const upload = multer({ storage: storage });



router.get('/menuItems', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM menu_item');
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "No menu items found"});
        }
        return res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch menu items"});
    }
});

router.get('/menuItems/item/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await pool.query('SELECT * FROM menu_item WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Menu item not found" });
        }
        return res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch menu item" });
    }
});

router.get('/menuItems/:vendorId', async (req, res) => {
    const { vendorId } = req.params;

    try {
        const result = await pool.query('SELECT * FROM menu_item WHERE vendor_id = $1', [vendorId]);
        return res.status(200).json({ success: true, menuItems: result.rows });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to fetch menu items" });
    }
});


router.post('/menuItems', upload.single('image'), async (req, res) => {
    const { vendorId, name, description, category, price } = req.body;
    
    if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
    }

    const imageUrl = `http://localhost:3000/uploads/${req.file.filename}`;

    if (!vendorId || !name || !description || !category || !price) {
        return res.status(400).json({ error: "All fields are required" });
    }

    try {
        const result = await pool.query(
            'INSERT INTO menu_item (vendor_id, name, description, category, price, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [vendorId, name, description, category, price, imageUrl]
        );
        return res.status(201).json({ message: "Menu item added successfully", menuItem: result.rows[0] });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to add menu item" });
    }
});

router.put('/menuItems/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        const result = await pool.query(
            'UPDATE menu_item SET is_available = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );

        if (result.rowCount > 0) {
            res.json({ success: true, message: 'Status updated successfully', menuItem: result.rows[0] });
        } else {
            res.status(404).json({ success: false, message: 'Menu item not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update status' });
    }
});


router.put('/menuItems/:id/price', async (req, res) => {
    const { id } = req.params;
    const { price } = req.body;

    if (!price || isNaN(price)) {
        return res.status(400).json({ success: false, message: 'Invalid price' });
    }

    try {
        const result = await pool.query(
            'UPDATE menu_item SET price = $1 WHERE id = $2 RETURNING *',
            [price, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Menu item not found' });
        }

        res.json({ success: true, message: 'Price updated successfully', menuItem: result.rows[0] });
    } catch (error) {
        console.error('Error updating price:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.delete('/menuItems/item/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM menu_item WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ success: false, message: 'Menu item not found' });
        }

        res.json({ success: true, message: 'Menu item deleted successfully' });
    } catch (error) {
        console.error('Error deleting menu item:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});





module.exports = router;