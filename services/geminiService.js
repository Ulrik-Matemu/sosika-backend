// services/geminiService.js
const fs = require('fs');
const path = require('path');

// Define key file path
const keyPath = path.join(__dirname, 'google-key.json');
const encodedKey = process.env.GOOGLE_SERVICE_ACCOUNT_BASE64;

// Write key file if it doesn't exist
if (!fs.existsSync(keyPath)) {
  fs.writeFileSync(keyPath, Buffer.from(encodedKey, 'base64').toString('utf-8'));
}

// Set this before loading genAI
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;


const { GoogleGenAI } = require("@google/genai");

// Initialize Gemini API
const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY });
// const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Prepares user order history data for Gemini analysis
 * @param {Object} userData - User data with order history
 * @param {Object} contextData - Current context (time, day, etc.)
 * @returns {Object} - Structured data for Gemini
 */
function prepareDataForGemini(userData, contextData) {
  // Extract relevant order history (last 10 orders)
  const orderHistory = userData.orders.slice(0, 10).map(order => ({
    datetime: order.order_datetime,
    dayOfWeek: new Date(order.order_datetime).getDay(),
    items: order.items.map(item => ({
      name: item.name,
      category: item.category,
      price: item.price,
      quantity: item.quantity,
      vendorId: item.vendor_id,
      vendorName: item.vendor_name
    })),
    totalAmount: order.total_amount,
    vendorRating: order.vendor_rating || null
  }));

  // Current available items from user's frequently ordered vendors
  const availableItems = userData.availableItems.map(item => ({
    id: item.id,
    name: item.name,
    category: item.category,
    price: item.price,
    vendorId: item.vendor_id,
    vendorName: item.vendor_name,
    isAvailable: item.is_available
  }));

  // Find user's preferred time ranges and categories
  const timeAnalysis = analyzeOrderTimePatterns(orderHistory);
  
  return {
    orderHistory,
    currentContext: {
      timeOfDay: contextData.timeOfDay,
      hourOfDay: contextData.hourOfDay,
      dayOfWeek: contextData.dayOfWeek,
      isWeekend: contextData.dayOfWeek === 0 || contextData.dayOfWeek === 6
    },
    availableItems: availableItems.filter(item => item.isAvailable),
    userPreferences: {
      timePatterns: timeAnalysis,
      frequentVendors: getFrequentVendors(orderHistory)
    }
  };
}

/**
 * Analyzes order time patterns to identify when user typically orders
 * @param {Array} orderHistory - User's order history
 * @returns {Object} - Time pattern analysis
 */
function analyzeOrderTimePatterns(orderHistory) {
  // Count orders by time of day
  const timeOfDayCounts = {
    morning: 0,   // 5:00 - 11:59
    afternoon: 0, // 12:00 - 16:59
    evening: 0,   // 17:00 - 21:59
    night: 0      // 22:00 - 4:59
  };
  
  orderHistory.forEach(order => {
    const hour = new Date(order.datetime).getHours();
    if (hour >= 5 && hour < 12) timeOfDayCounts.morning++;
    else if (hour >= 12 && hour < 17) timeOfDayCounts.afternoon++;
    else if (hour >= 17 && hour < 22) timeOfDayCounts.evening++;
    else timeOfDayCounts.night++;
  });
  
  return {
    preferredTimeOfDay: Object.entries(timeOfDayCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key),
    ordersByDayOfWeek: countOrdersByDayOfWeek(orderHistory)
  };
}

/**
 * Counts orders by day of week
 * @param {Array} orderHistory - User's order history
 * @returns {Array} - Order counts by day of week (0 = Sunday, 6 = Saturday)
 */
function countOrdersByDayOfWeek(orderHistory) {
  const dayCountMap = [0, 0, 0, 0, 0, 0, 0]; // Sun to Sat
  
  orderHistory.forEach(order => {
    const dayOfWeek = new Date(order.datetime).getDay();
    dayCountMap[dayOfWeek]++;
  });
  
  return dayCountMap;
}

/**
 * Identifies frequently ordered vendors
 * @param {Array} orderHistory - User's order history
 * @returns {Array} - Ranked list of vendors by frequency
 */
function getFrequentVendors(orderHistory) {
  const vendorCounts = {};
  
  orderHistory.forEach(order => {
    order.items.forEach(item => {
      vendorCounts[item.vendorId] = (vendorCounts[item.vendorId] || 0) + 1;
    });
  });
  
  // Return sorted array of [vendorId, count] pairs
  return Object.entries(vendorCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([vendorId, count]) => ({
      vendorId: parseInt(vendorId),
      count
    }));
}

/**
 * Generates the prompt for Gemini API
 * @param {Object} data - Prepared data for Gemini
 * @returns {String} - Formatted prompt
 */
function generateGeminiPrompt(data) {
  const { orderHistory, currentContext, availableItems, userPreferences } = data;
  
  // Format time of day information
  const timeContext = `Current time is ${currentContext.hourOfDay}:00, which is considered ${currentContext.timeOfDay}. It's ${currentContext.isWeekend ? 'a weekend' : 'a weekday'} (${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][currentContext.dayOfWeek]}).`;
  
  // Format order history summary
  const historyItems = orderHistory.map(order => {
    const itemsList = order.items.map(item => `${item.name} (${item.category}) from ${item.vendorName}`).join(", ");
    return `- Ordered on ${new Date(order.datetime).toLocaleDateString()} at ${new Date(order.datetime).toLocaleTimeString()}: ${itemsList}`;
  }).join("\n");
  
  // Format available items (limit to reasonable number)
  const topVendors = userPreferences.frequentVendors.slice(0, 3).map(v => v.vendorId);
  const relevantItems = availableItems
    .filter(item => topVendors.includes(item.vendorId))
    .slice(0, 20); // Limit to 20 items to keep prompt size reasonable
  
  const availableItemsList = relevantItems.map(item => 
    `- ${item.name} (${item.category}) from ${item.vendorName} - $${item.price}`
  ).join("\n");

  return `
You are a food recommendation AI for a college food delivery app. Based on the user's order history and current context, recommend a single menu item they are likely to want right now. Be decisive and confident.

USER CONTEXT:
${timeContext}

ORDER HISTORY:
${historyItems}

AVAILABLE ITEMS FROM PREFERRED VENDORS:
${availableItemsList}

ANALYSIS:
- User typically orders during: ${userPreferences.timePatterns.preferredTimeOfDay.join(", ")}
- User's most active ordering days: ${userPreferences.timePatterns.ordersByDayOfWeek.map((count, idx) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx]}: ${count}`).join(", ")}

INSTRUCTIONS:
1. Look at what the user typically orders at this time of day and day of week
2. Consider only items that are currently available
3. Make a single confident recommendation with high likelihood of being what the user wants
4. Return ONLY a JSON object with these exact keys:
   {
     "recommendedItemId": number,
     "recommendedItemName": string,
     "vendorId": number,
     "vendorName": string,
     "price": number,
     "confidence": number (between 0 and 1),
     "reasoning": string (brief explanation of why this item was chosen)
   }
`;
}

/**
 * Calls Gemini API to get food recommendation
 * @param {Object} data - Prepared data for Gemini
 * @returns {Promise<Object>} - Recommended food item
 */
async function getRecommendation(data) {
  try {
    const prompt = generateGeminiPrompt(data);

    // ✅ Create model instance properly
    // const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });

    // ✅ Call generateContent on the model
    const result = await genAI.models.generateContent({
      model: "gemini-1.5-flash", // Model name
      contents: prompt,          // Prompt content
    });
    const responseText = await result.response.text();

    // 🔍 Extract JSON from response
    let recommendation;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      recommendation = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

      if (!recommendation || !recommendation.recommendedItemId) {
        throw new Error("Invalid recommendation format");
      }
    } catch (parseError) {
      console.error("Failed to parse Gemini response:", parseError);
      return null;
    }

    return recommendation;
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return null;
  }
}


module.exports = {
  prepareDataForGemini,
  getRecommendation
};