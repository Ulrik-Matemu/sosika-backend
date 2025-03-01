const express = require('express');
const router = express.Router();
const pool = require('../db');

router.post('/colleges', async (req, res) => {
    const { name, address } = req.body;
    try {
        const result = await pool.query('INSERT INTO college (name, address) VALUES ($1, $2) RETURNING *', 
            [name, address]);
        res.status(201).json({ message: "College Added Successfully"});
        console.log(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error adding college"});
    }
});


router.get('/colleges', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM college');
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "No colleges found"});
        }
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch colleges"});
    }
})

module.exports = router;