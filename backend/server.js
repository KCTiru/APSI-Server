// server.js
const express = require("express");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Prefer env var; fallback to a hardcoded URL (useful for quick testing)
// <--- IMPORTANT: do NOT commit a real DB URL with credentials to git. Use env vars.
const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://apsi_db_user:7lGZ5cwSoB8GBJYrhXkwbGiwsB1oNRnR@dpg-d38i8i7fte5s73c49m70-a.singapore-postgres.render.com/apsi_db';

// Decide whether this is a local DB (no TLS required) or a hosted DB (TLS required).
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
const useSsl = !isLocal;

// Create pool with SSL when needed
const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

// Ensure schema exists (safe on first run)
async function ensureSchema() {
  const createExt = `CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
  const createTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      email VARCHAR(100) NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  try {
    await pool.query(createExt);
    await pool.query(createTable);
    console.log("DB schema ensured.");
  } catch (err) {
    console.error("Error ensuring DB schema:", err);
  }
}
ensureSchema();

// Register
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body || {};

  // Basic validation
  if (!username || !email || !password) {
    return res.status(400).json({ error: "username, email and password are required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id",
      [username, email, hashedPassword]
    );
    res.json({ message: "User registered successfully", id: result.rows[0].id });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    // handle unique constraint errors nicely
    if (err.code === "23505") {
      return res.status(400).json({ error: "Username or email already exists", detail: err.detail });
    }
    res.status(500).json({ error: "Registration failed", code: err.code, message: err.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required" });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }
    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid password" });

    // Return non-sensitive user info
    res.json({ message: "Login successful", user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ error: "Login failed", code: err.code, message: err.message });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Server running on port ${port}`));
