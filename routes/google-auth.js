const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const pool = require("../db"); // Your PostgreSQL connection

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const googleAuth = async (req, res) => {
    try {
      const { email, full_name, college_id } = req.body;
  
      // Check if user exists
      let user = await pool.query("SELECT * FROM public.user WHERE email = $1", [email]);
  
      if (user.rows.length === 0) {
        // Insert new Google user with hardcoded college_id
        const insertQuery = `
          INSERT INTO "user" (full_name, email, phone_number, college_id, college_registration_number, password, geolocation, custom_address)
          VALUES ($1, $2, '0000000000', $3, 'TO_BE_UPDATED', 'GOOGLE_AUTH', point(0,0), point(0,0))
          RETURNING *;
        `;
        user = await pool.query(insertQuery, [full_name, email, college_id]);
      } else {
        user = user.rows[0]; // Existing user
      }
  
      // Generate JWT
      const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "7d" });
  
      res.json({ message: "Login successful", token, user });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Google authentication failed" });
    }
  };
  
  module.exports = { googleAuth };