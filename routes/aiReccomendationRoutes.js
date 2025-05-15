// routes/aiRecommendationRoutes.js
const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid'); // Import uuid library
const { prepareDataForGemini, getRecommendation } = require('../services/geminiService');
const db = require('../db');

/**
 * GET /api/recommendations/one-tap/:userId
 * Get AI-powered meal recommendation based on user history
 */
// Assuming userId parameter in route is the UUID of the user
router.get('/one-tap/:userId', async (req, res) => {
    try {
        // --- MODIFIED userId EXTRACTION AND VALIDATION (assuming UUID string) ---
        const userId = req.params.userId; // Expecting a UUID string from the route parameter

        // Basic validation for userId (can add more robust UUID format validation)
        if (!userId) {
             console.error("User ID is missing from route parameters.");
             return res.status(400).json({
                 success: false,
                 message: "User ID is required."
             });
        }
        // You might want to add a regex check here to ensure userId is a valid UUID format
        // const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        // if (!uuidRegex.test(userId)) {
        //     console.error("Invalid User ID format (expected UUID):", userId);
        //     return res.status(400).json({
        //         success: false,
        //         message: "Invalid User ID format."
        //     });
        // }
        // --- END MODIFIED userId EXTRACTION AND VALIDATION ---


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
        // NOTE: This query assumes user_id in 'orders' table is compatible with the userId variable (which is now assumed to be a UUID string)
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

        // Get user's top vendors (still needed for prepareDataForGemini and filtering for Gemini prompt)
        // NOTE: This query assumes user_id in 'orders' table is compatible with the userId variable (UUID string)
        const topVendorsQuery = `
            SELECT v.id, COUNT(*) as order_count
            FROM orders o
            JOIN vendor v ON o.vendor_id = v.id
            WHERE o.user_id = $1
            GROUP BY v.id
            ORDER BY COUNT(*) DESC
            LIMIT 3
        `;

        const topVendorsResult = await db.query(topVendorsQuery, [userId]);
        // NOTE: topVendorIds will be an array of vendor IDs. Their type depends on the 'vendor' table's id column.
        // If 'vendor.id' is integer (from migration.sql), topVendorIds will be integers.
        // If 'vendor.id' is UUID (to match ai_recommendations), topVendorIds will be UUIDs.
        const topVendorIds = topVendorsResult.rows.map(v => v.id);


        // Get ALL available menu items to provide a pool for fallback recommendations
        // NOTE: This query assumes menu_item.vendor_id and vendor.id are compatible.
        const availableItemsQuery = `
            SELECT mi.id, mi.name, mi.category, mi.price,
                   mi.vendor_id, v.name as vendor_name, mi.is_available
            FROM menu_item mi
            JOIN vendor v ON mi.vendor_id = v.id
            WHERE mi.is_available = true AND v.is_open = true; -- Also ensure vendor is open
        `;

        const availableItemsResult = await db.query(availableItemsQuery);
        // NOTE: availableItemsResult.rows will contain item details.
        // item.id will be the type of menu_item.id.
        // item.vendor_id will be the type of menu_item.vendor_id.


        // Prepare data for Gemini
        const userData = {
            orders: userOrdersResult.rows,
            availableItems: availableItemsResult.rows // This now contains ALL available items
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

        // Extra validation - verify that the recommended item actually exists in the database
        // NOTE: This query assumes menu_item.id and vendor.id are compatible with
        // recommendation.recommendedItemId and recommendation.vendorId (which come from geminiService,
        // and in fallback cases are sourced from availableItemsResult.rows).
        const verifyItemQuery = `
            SELECT mi.id, mi.name, mi.price, mi.is_available,
                   v.id as vendor_id, v.name as vendor_name, v.is_open
            FROM menu_item mi
            JOIN vendor v ON mi.vendor_id = v.id
            WHERE mi.id = $1 AND mi.is_available = true AND v.is_open = true
        `;

        const verifyResult = await db.query(verifyItemQuery, [recommendation.recommendedItemId]);

        if (verifyResult.rows.length === 0) {
            console.warn(`Recommended item ID ${recommendation.recommendedItemId} failed final verification.`);
            return res.status(404).json({
                success: false,
                message: "The recommended item is currently unavailable or vendor is closed."
            });
        }

        // Use the verified item from database to ensure data consistency
        const verifiedItem = verifyResult.rows[0];

        // --- MODIFIED INSERT STATEMENT ---
        // Generate a UUID for the recommendation ID
        const trackingId = uuidv4(); // Generate a proper UUID

        // Ensure data types match the ai_recommendations table (UUIDs)
        // This requires userId, verifiedItem.id, and verifiedItem.vendor_id to be UUIDs.
        // Based on migration.sql, they are likely integers, creating a mismatch.
        // For this code to work with the ai_recommendations UUID schema,
        // the other tables MUST also use UUIDs for their IDs.
        // Assuming they do, the values from query results (verifiedItem.id, verifiedItem.vendor_id)
        // and the userId from route parameter should already be UUIDs.
        await db.query(
            `INSERT INTO ai_recommendations
            (id, user_id, menu_item_id, vendor_id, confidence, reasoning, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [trackingId, userId, verifiedItem.id, verifiedItem.vendor_id,
                recommendation.confidence, recommendation.reasoning]
        );
        // --- END MODIFIED INSERT STATEMENT ---


        res.json({
            success: true,
            recommendation: {
                ...recommendation, // Include confidence and reasoning from service
                recommendationId: trackingId, // Add tracking ID (the generated UUID)
                recommendedItemId: verifiedItem.id, // Use verified details (assumed UUID)
                recommendedItemName: verifiedItem.name,
                vendorId: verifiedItem.vendor_id, // Use verified details (assumed UUID)
                vendorName: verifiedItem.vendor_name,
                price: verifiedItem.price
            }
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
router.post('/feedback/:userId', async (req, res) => {
    try {
       let userId = req.params.userId;
       userId = new uuidv4(userId); // Convert to UUID
        // Assuming user ID is available on req.user after authentication middleware and is a UUID
        const { recommendationId, accepted, itemOrdered } = req.body;
    // Make sure your auth middleware populates req.user.id with a UUID

         // Basic validation for userId and recommendationId (assuming UUID strings)
         if (!userId || !recommendationId) {
             console.error("User ID or Recommendation ID missing for feedback.");
             return res.status(400).json({
                 success: false,
                 message: "User ID and Recommendation ID are required for feedback."
             });
         }
        // Add UUID format validation if needed
        

        // Store feedback for future model improvements
        // Ensure recommendation_feedback table exists and user_id, recommendation_id are compatible with UUIDs
        await db.query(
            `INSERT INTO recommendation_feedback
       (user_id, recommendation_id, accepted, item_ordered, feedback_datetime)
       VALUES ($1, $2, $3, $4, NOW())`,
            [userId, recommendationId, accepted, itemOrdered] // Assuming userId and recommendationId are UUIDs
        );

        res.json({ success: true, message: 'Feedback recorded successfully' });
    } catch (error) {
        console.error('Error recording recommendation feedback:', error);
        res.status(500).json({ success: false, message: 'Failed to record feedback' });
    }
});

module.exports = router;