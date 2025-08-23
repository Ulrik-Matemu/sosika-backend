const express = require('express');
const pool = require('../db');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../cloudinary');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage(
  {
    destination: "uploads/",
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    },
  }
);

const upload = multer({ dest: 'uploads/' }); // Temporary storage before Cloudinary upload




router.get('/menuItems', async (req, res) => {
  try {
    const { page, limit } = req.query;

    // Default to returning all items if pagination is not specified
    if (!page || !limit) {
      const result = await pool.query('SELECT * FROM menu_item');
      if (result.rows.length === 0) {
        return res.status(404).json({ error: "No menu items found" });
      }
      return res.status(200).json(result.rows);
    }

    // Convert page and limit to integers
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const paginatedQuery = 'SELECT * FROM menu_item LIMIT $1 OFFSET $2';
    const result = await pool.query(paginatedQuery, [limitNum, offset]);

    // Optional: Get total count (for frontend UI pagination)
    const countResult = await pool.query('SELECT COUNT(*) FROM menu_item');
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limitNum);

    return res.status(200).json({
      data: result.rows,
      pagination: {
        totalItems,
        totalPages,
        currentPage: pageNum,
        itemsPerPage: limitNum
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch menu items" });
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

  try {
    // Upload image to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'menu-items', // Cloudinary folder name
      use_filename: true
    });

    // Remove the temporary file after upload
    fs.unlinkSync(req.file.path);

    // Store Cloudinary image URL in the database
    const imageUrl = result.secure_url;

    if (!vendorId || !name || !description || !category || !price) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const dbResult = await pool.query(
      'INSERT INTO menu_item (vendor_id, name, description, category, price, image_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [vendorId, name, description, category, price, imageUrl]
    );

    return res.status(201).json({ message: "Menu item added successfully", menuItem: dbResult.rows[0] });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to add menu item" });
  }
});

// Edit menu item
router.put('/menuItems/:id', upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, category, price } = req.body;

  try {
    let imageUrl;

    // If a new image is uploaded, push it to Cloudinary
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'menu-items',
        use_filename: true,
      });

      fs.unlinkSync(req.file.path);
      imageUrl = result.secure_url;
    }

    // Build update query dynamically
    const fields = [];
    const values = [];
    let query = "UPDATE menu_item SET ";

    if (name) {
      fields.push(`name = $${fields.length + 1}`);
      values.push(name);
    }
    if (description) {
      fields.push(`description = $${fields.length + 1}`);
      values.push(description);
    }
    if (category) {
      fields.push(`category = $${fields.length + 1}`);
      values.push(category);
    }
    if (price) {
      fields.push(`price = $${fields.length + 1}`);
      values.push(price);
    }
    if (imageUrl) {
      fields.push(`image_url = $${fields.length + 1}`);
      values.push(imageUrl);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: "No fields provided for update" });
    }

    query += fields.join(", ") + ` WHERE id = $${fields.length + 1} RETURNING *`;
    values.push(id);

    const dbResult = await pool.query(query, values);

    if (dbResult.rows.length === 0) {
      return res.status(404).json({ error: "Menu item not found" });
    }

    return res.status(200).json({ message: "Menu item updated successfully", menuItem: dbResult.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to update menu item" });
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


// GET /menuItem/popular-menu-items
router.get('/menuItem/popular-menu-items', async (req, res) => {
  const vendorIds = req.query.vendorIds?.split(',').map(Number).filter(Boolean);

  try {
    let result;

    if (vendorIds && vendorIds.length > 0) {
      // Fetch popular items for specific vendors
      result = await pool.query(
        `
        SELECT 
          m.id, m.name, m.price, m.image_url, m.description, m.category, m.is_available, m.vendor_id,
          SUM(omi.quantity) AS total_sold
        FROM menu_item m
        JOIN order_menu_item omi ON m.id = omi.menu_item_id
        WHERE m.vendor_id = ANY($1::int[])
        GROUP BY m.id
        ORDER BY total_sold DESC
        LIMIT 12
        `,
        [vendorIds]
      );
    } else {
      // Fetch globally popular items
      result = await pool.query(
        `
        SELECT 
          m.id, m.name, m.price, m.image_url, m.description, m.category, m.is_available, m.vendor_id,
          SUM(omi.quantity) AS total_sold
        FROM menu_item m
        JOIN order_menu_item omi ON m.id = omi.menu_item_id
        GROUP BY m.id
        ORDER BY total_sold DESC
        LIMIT 12
        `
      );
    }

    res.status(200).json({ success: true, items: result.rows });
  } catch (error) {
    console.error('Error fetching popular items:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch popular items' });
  }
});


// routes/menuItems.js
router.get('/menuItem/nearby', async (req, res) => {
  const { lat, lng, radius } = req.query; // radius in km
  try {
    const result = await pool.query(
      `
      SELECT mi.*, v.vendor_name, v.geolocation
      FROM menu_item mi
      JOIN vendor v ON mi.vendor_id = v.id
      WHERE ST_DWithin(
        v.geolocation::geography,
        ST_MakePoint($1, $2)::geography,
        $3 * 1000
      )
      ORDER BY ST_Distance(
        v.geolocation::geography,
        ST_MakePoint($1, $2)::geography
      )
      LIMIT 50
      `,
      [lng, lat, radius]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch nearby menu items' });
  }
});







module.exports = router;