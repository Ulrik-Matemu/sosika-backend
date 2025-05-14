// routes/aiRecommendationRoutes.js
const express = require('express');
const router = express.Router();
const { prepareDataForGemini, getRecommendation } = require('../services/geminiService');
const db = require('../db');

/**
 * GET /api/recommendations/one-tap
 * Get AI-powered meal recommendation based on user history
 */
router.get('/one-tap', async (req, res) => {
  try {
    const userId = req.params.userId; // Assuming user ID is passed as a route parameter
    
    // Get current datetime for context
    const now = new Date();
    const hourOfDay = now.getHours();
    const dayOfWeek = now.getDay(); // 0-6, where 0 is Sunday
    
    // Determine time of day
    let timeOfDay;
    if (hourOfDay >= 5 && hourOfDay < 12) timeOfDay = 'morning';
    else if (hourOfDay >= 12 && hourOfDay < 17) timeOfDay = 'afternoon';
    else if (hourOfDay >= 17 && hourOfDay < 22) timeOfDay = 'evening';
    else timeOfDay = 'night';
    
    // Context data
    const contextData = {
      timeOfDay,
      hourOfDay,
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6
    };
    
    // Get user's order history with items
    const userOrdersQuery = `
      SELECT o.id, o.order_datetime, o.total_amount, o.vendor_rating, o.vendor_id,
             v.name as vendor_name,
             json_agg(
               json_build_object(
                 'id', mi.id,
                 'name', mi.name,
                 'category', mi.category,
                 'price', omi.price,
                 'quantity', omi.quantity,
                 'vendor_id', v.id,
                 'vendor_name', v.name
               )
             ) as items
      FROM orders o
      JOIN vendor v ON o.vendor_id = v.id
      JOIN order_menu_item omi ON o.id = omi.order_id
      JOIN menu_item mi ON omi.menu_item_id = mi.id
      WHERE o.user_id = $1
      GROUP BY o.id, o.order_datetime, o.total_amount, o.vendor_rating, o.vendor_id, v.name
      ORDER BY o.order_datetime DESC
      LIMIT 10
    `;
    
    const userOrdersResult = await db.query(userOrdersQuery, [userId]);
    
    // Get available menu items from user's preferred vendors
    // First, find user's top vendors
    const topVendorsQuery = `
      SELECT DISTINCT v.id
      FROM orders o
      JOIN vendor v ON o.vendor_id = v.id
      WHERE o.user_id = $1
      ORDER BY COUNT(*) DESC
      LIMIT 3
    `;
    
    const topVendorsResult = await db.query(topVendorsQuery, [userId]);
    const topVendorIds = topVendorsResult.rows.map(v => v.id);
    
    // Get menu items from those vendors
    const availableItemsQuery = `
      SELECT mi.id, mi.name, mi.category, mi.price, 
             mi.vendor_id, v.name as vendor_name, mi.is_available
      FROM menu_item mi
      JOIN vendor v ON mi.vendor_id = v.id
      WHERE mi.vendor_id = ANY($1) AND mi.is_available = true
    `;
    
    const availableItemsResult = await db.query(availableItemsQuery, [topVendorIds]);
    
    // Prepare data for Gemini
    const userData = {
      orders: userOrdersResult.rows,
      availableItems: availableItemsResult.rows
    };
    
    const preparedData = prepareDataForGemini(userData, contextData);
    
    // Get recommendation from Gemini
    const recommendation = await getRecommendation(preparedData);
    
    if (!recommendation) {
      return res.status(404).json({ 
        success: false, 
        message: "Couldn't generate a recommendation at this time" 
      });
    }
    
    res.json({
      success: true,
      recommendation
    });
  } catch (error) {
    console.error('Error generating AI recommendation:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to generate recommendation',
      error: error.message
    });
  }
});

/**
 * POST /api/recommendations/feedback
 * Record user feedback on recommendations to improve the model
 */
router.post('/feedback', async (req, res) => {
  try {
    const { recommendationId, accepted, itemOrdered } = req.body;
    const userId = req.user.id;
    
    // Store feedback for future model improvements
    await db.query(
      `INSERT INTO recommendation_feedback 
       (user_id, recommendation_id, accepted, item_ordered, feedback_datetime)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, recommendationId, accepted, itemOrdered]
    );
    
    res.json({ success: true, message: 'Feedback recorded successfully' });
  } catch (error) {
    console.error('Error recording recommendation feedback:', error);
    res.status(500).json({ success: false, message: 'Failed to record feedback' });
  }
});

module.exports = router;