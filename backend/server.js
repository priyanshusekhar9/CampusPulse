
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const { sql, connectDB } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use("/uploads", express.static(uploadDir));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    message: "Too many login or signup attempts. Try again in 15 minutes."
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `event-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return cb(null, true);
    }
    cb(new Error("Only JPG, PNG and WebP images are allowed."));
  }
});

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function verifyToken(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Please log in first." });
  }

  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired login token. Please log in again."
    });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
}

function studentOnly(req, res, next) {
  if (req.user.role !== "student") {
    return res.status(403).json({
      message: "A student account is required."
    });
  }
  next();
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

function removeUploadedFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return;
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error("File cleanup error:", error.message);
  }
}

function removeOldPoster(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/uploads/")) return;
  const filename = path.basename(imageUrl);
  const fullPath = path.join(uploadDir, filename);
  if (path.dirname(fullPath) === uploadDir) removeUploadedFile(fullPath);
}

function parseCapacity(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) return NaN;
  return number;
}

app.get("/", (req, res) => {
  res.send("Campus Pulse API is running!");
});

app.get("/api/test-db", async (req, res) => {
  try {
    const result = await sql.query("SELECT DB_NAME() AS databaseName");
    res.json({
      message: "Database connected successfully",
      database: result.recordset[0].databaseName
    });
  } catch (error) {
    console.error("DB test:", error.message);
    res.status(500).json({ message: "Database query failed." });
  }
});

// ================= AUTH =================

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const request = new sql.Request();
    request.input("email", sql.NVarChar(255), email);

    const result = await request.query(`
      SELECT id, name, email, password_hash, role
      FROM Users
      WHERE LOWER(email) = @email
    `);

    const user = result.recordset[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const account = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.json({
      message: user.role === "admin"
        ? "Admin login successful."
        : "Login successful.",
      token: makeToken(user),
      ...(user.role === "admin" ? { admin: account } : { user: account })
    });
  } catch (error) {
    console.error("Login error:", error.message);
    res.status(500).json({ message: "Login failed." });
  }
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = req.body.password;

    if (!name || !email || typeof password !== "string") {
      return res.status(400).json({
        message: "Name, email and password are required."
      });
    }

    if (name.length > 100 || email.length > 255) {
      return res.status(400).json({ message: "Name or email is too long." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Enter a valid email." });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        message: "Password must be between 8 and 72 characters."
      });
    }

    const check = new sql.Request();
    check.input("email", sql.NVarChar(255), email);
    const existing = await check.query(`
      SELECT id FROM Users WHERE LOWER(email) = @email
    `);

    if (existing.recordset.length) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const insert = new sql.Request();
    insert.input("name", sql.NVarChar(100), name);
    insert.input("email", sql.NVarChar(255), email);
    insert.input("password_hash", sql.NVarChar(255), passwordHash);
    insert.input("role", sql.NVarChar(20), "student");

    const created = await insert.query(`
      INSERT INTO Users (name, email, password_hash, role)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.role
      VALUES (@name, @email, @password_hash, @role)
    `);

    const user = created.recordset[0];
    res.status(201).json({
      message: "Student account created successfully.",
      token: makeToken(user),
      user
    });
  } catch (error) {
    if (error.number === 2601 || error.number === 2627) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }
    console.error("Signup error:", error.message);
    res.status(500).json({ message: "Could not create student account." });
  }
});

// Read the currently authenticated user's profile.
app.get("/api/auth/me", verifyToken, async (req, res) => {
  try {
    const request = new sql.Request();
    request.input("id", sql.Int, req.user.id);

    const result = await request.query(`
      SELECT id, name, email, role
      FROM Users
      WHERE id = @id
    `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: "Account not found." });
    }

    res.json({ user: result.recordset[0] });
  } catch (error) {
    console.error("Profile error:", error.message);
    res.status(500).json({ message: "Could not load profile." });
  }
});

// Update the account's display name; never accept a role from the client.
app.patch("/api/auth/me", verifyToken, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name || name.length > 100) {
      return res.status(400).json({
        message: "Enter a name between 1 and 100 characters."
      });
    }

    const request = new sql.Request();
    request.input("id", sql.Int, req.user.id);
    request.input("name", sql.NVarChar(100), name);

    const result = await request.query(`
      UPDATE Users
      SET name = @name
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.email, INSERTED.role
      WHERE id = @id
    `);

    if (!result.recordset.length) {
      return res.status(404).json({ message: "Account not found." });
    }

    res.json({
      message: "Profile updated successfully.",
      user: result.recordset[0]
    });
  } catch (error) {
    console.error("Profile update error:", error.message);
    res.status(500).json({ message: "Could not update profile." });
  }
});

// ================= PUBLIC EVENTS =================

app.get("/api/events", async (req, res) => {
  try {
    const result = await sql.query(`
      SELECT e.id, e.title, e.description, e.category, e.venue,
             e.event_date, e.image_url, e.capacity,
             COUNT(r.id) AS registered_count
      FROM Events e
      LEFT JOIN EventRegistrations r ON r.event_id = e.id
      GROUP BY e.id, e.title, e.description, e.category, e.venue,
               e.event_date, e.image_url, e.capacity
      ORDER BY e.event_date ASC
    `);

    res.json(result.recordset);
  } catch (error) {
    console.error("Fetch events error:", error.message);
    res.status(500).json({ message: "Could not fetch events." });
  }
});

// ================= ADMIN EVENT MANAGEMENT =================

app.post(
  "/api/events",
  verifyToken,
  adminOnly,
  upload.single("image"),
  async (req, res) => {
    try {
      const { title, description, category, venue, event_date } = req.body;
      const capacity = parseCapacity(req.body.capacity);

      if (!title?.trim() || !category?.trim() ||
          !venue?.trim() || !event_date) {
        removeUploadedFile(req.file?.path);
        return res.status(400).json({
          message: "Title, category, venue and event date are required."
        });
      }

      if (Number.isNaN(capacity)) {
        removeUploadedFile(req.file?.path);
        return res.status(400).json({
          message: "Capacity must be a positive whole number or left empty."
        });
      }

      const date = new Date(event_date);
      if (Number.isNaN(date.getTime())) {
        removeUploadedFile(req.file?.path);
        return res.status(400).json({ message: "Invalid event date." });
      }

      const request = new sql.Request();
      request.input("title", sql.NVarChar(160), title.trim());
      request.input("description", sql.NVarChar(sql.MAX), description || "");
      request.input("category", sql.NVarChar(60), category.trim());
      request.input("venue", sql.NVarChar(160), venue.trim());
      request.input("event_date", sql.DateTime2, date);
      request.input("capacity", sql.Int, capacity);
      request.input("image_url", sql.NVarChar(1000),
        req.file ? `/uploads/${req.file.filename}` : null);
      request.input("created_by", sql.Int, req.user.id);

      const result = await request.query(`
        INSERT INTO Events
          (title, description, category, venue, event_date, image_url, created_by, capacity)
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.description,
               INSERTED.category, INSERTED.venue, INSERTED.event_date,
               INSERTED.image_url, INSERTED.capacity
        VALUES
          (@title, @description, @category, @venue, @event_date, @image_url, @created_by, @capacity)
      `);

      res.status(201).json({
        message: "Event created successfully!",
        event: result.recordset[0]
      });
    } catch (error) {
      removeUploadedFile(req.file?.path);
      console.error("Create event error:", error.message);
      res.status(500).json({ message: "Could not create event." });
    }
  }
);

app.put(
  "/api/events/:id",
  verifyToken,
  adminOnly,
  upload.single("image"),
  async (req, res) => {
    try {
      const id = validId(req.params.id);
      const { title, description, category, venue, event_date } = req.body;
      const capacity = parseCapacity(req.body.capacity);

      if (!id) {
        removeUploadedFile(req.file?.path);
        return res.status(400).json({ message: "Invalid event ID." });
      }

      if (!title?.trim() || !category?.trim() ||
          !venue?.trim() || !event_date) {
        removeUploadedFile(req.file?.path);
        return res.status(400).json({
          message: "Title, category, venue and event date are required."
        });
      }

      if (Number.isNaN(capacity)) {
        removeUploadedFile(req.file?.path);
        return res.status(400).json({ message: "Invalid event capacity." });
      }

      const date = new Date(event_date);
      if (Number.isNaN(date.getTime())) {
        removeUploadedFile(req.file?.path);
        return res.status(400).json({ message: "Invalid event date." });
      }

      const oldRequest = new sql.Request();
      oldRequest.input("id", sql.Int, id);
      const oldResult = await oldRequest.query(`
        SELECT image_url FROM Events WHERE id = @id
      `);

      if (!oldResult.recordset.length) {
        removeUploadedFile(req.file?.path);
        return res.status(404).json({ message: "Event not found." });
      }

      const oldImage = oldResult.recordset[0].image_url;
      const request = new sql.Request();
      request.input("id", sql.Int, id);
      request.input("title", sql.NVarChar(160), title.trim());
      request.input("description", sql.NVarChar(sql.MAX), description || "");
      request.input("category", sql.NVarChar(60), category.trim());
      request.input("venue", sql.NVarChar(160), venue.trim());
      request.input("event_date", sql.DateTime2, date);
      request.input("capacity", sql.Int, capacity);
      request.input("new_image_url", sql.NVarChar(1000),
        req.file ? `/uploads/${req.file.filename}` : null);

      const result = await request.query(`
        UPDATE Events
        SET title = @title,
            description = @description,
            category = @category,
            venue = @venue,
            event_date = @event_date,
            capacity = @capacity,
            image_url = CASE
              WHEN @new_image_url IS NOT NULL THEN @new_image_url
              ELSE image_url
            END
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.description,
               INSERTED.category, INSERTED.venue, INSERTED.event_date,
               INSERTED.image_url, INSERTED.capacity
        WHERE id = @id
      `);

      if (req.file && oldImage !== result.recordset[0].image_url) {
        removeOldPoster(oldImage);
      }

      res.json({
        message: "Event updated successfully.",
        event: result.recordset[0]
      });
    } catch (error) {
      removeUploadedFile(req.file?.path);
      console.error("Update event error:", error.message);
      res.status(500).json({ message: "Could not update event." });
    }
  }
);

app.put(
  "/api/events/:id/image",
  verifyToken,
  adminOnly,
  upload.single("image"),
  async (req, res) => {
    const uploadedPath = req.file?.path;

    try {
      const id = validId(req.params.id);
      if (!id) {
        removeUploadedFile(uploadedPath);
        return res.status(400).json({ message: "Invalid event ID." });
      }
      if (!req.file) {
        return res.status(400).json({ message: "Select an image file." });
      }

      const lookup = new sql.Request();
      lookup.input("id", sql.Int, id);
      const oldResult = await lookup.query(`
        SELECT image_url FROM Events WHERE id = @id
      `);

      if (!oldResult.recordset.length) {
        removeUploadedFile(uploadedPath);
        return res.status(404).json({ message: "Event not found." });
      }

      const oldImage = oldResult.recordset[0].image_url;
      const request = new sql.Request();
      request.input("id", sql.Int, id);
      request.input("image_url", sql.NVarChar(1000),
        `/uploads/${req.file.filename}`);

      const result = await request.query(`
        UPDATE Events
        SET image_url = @image_url
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.image_url
        WHERE id = @id
      `);

      removeOldPoster(oldImage);

      res.json({
        message: "Event poster updated successfully!",
        event: result.recordset[0]
      });
    } catch (error) {
      removeUploadedFile(uploadedPath);
      console.error("Poster update error:", error.message);
      res.status(500).json({ message: "Could not update poster." });
    }
  }
);

// Admin: list students registered for a specific event.
app.get(
  "/api/events/:id/registrations",
  verifyToken,
  adminOnly,
  async (req, res) => {
    try {
      const eventId = validId(req.params.id);
      if (!eventId) {
        return res.status(400).json({ message: "Invalid event ID." });
      }

      const request = new sql.Request();
      request.input("event_id", sql.Int, eventId);

      const result = await request.query(`
        SELECT e.id AS event_id, e.title AS event_title,
               u.id AS student_id, u.name, u.email, r.registered_at
        FROM Events e
        LEFT JOIN EventRegistrations r ON r.event_id = e.id
        LEFT JOIN Users u ON u.id = r.user_id
        WHERE e.id = @event_id
        ORDER BY r.registered_at DESC
      `);

      if (!result.recordset.length) {
        return res.status(404).json({ message: "Event not found." });
      }

      const rows = result.recordset;
      const attendees = rows
        .filter((row) => row.student_id !== null)
        .map((row) => ({
          id: row.student_id,
          name: row.name,
          email: row.email,
          registered_at: row.registered_at
        }));

      res.json({
        event: { id: rows[0].event_id, title: rows[0].event_title },
        total: attendees.length,
        attendees
      });
    } catch (error) {
      console.error("Attendee list error:", error.message);
      res.status(500).json({ message: "Could not load attendees." });
    }
  }
);

app.delete(
  "/api/events/:id",
  verifyToken,
  adminOnly,
  async (req, res) => {
    const id = validId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid event ID." });

    const transaction = new sql.Transaction();

    try {
      await transaction.begin();

      const lookup = new sql.Request(transaction);
      lookup.input("id", sql.Int, id);
      const found = await lookup.query(`
        SELECT id, image_url FROM Events WHERE id = @id
      `);

      if (!found.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ message: "Event not found." });
      }

      const registrations = new sql.Request(transaction);
      registrations.input("id", sql.Int, id);
      await registrations.query(`
        DELETE FROM EventRegistrations WHERE event_id = @id
      `);

      const removeEvent = new sql.Request(transaction);
      removeEvent.input("id", sql.Int, id);
      await removeEvent.query(`DELETE FROM Events WHERE id = @id`);

      await transaction.commit();
      removeOldPoster(found.recordset[0].image_url);

      res.json({
        message: "Event and its registrations deleted successfully.",
        id
      });
    } catch (error) {
      try { await transaction.rollback(); } catch {}
      console.error("Delete event error:", error.message);
      res.status(500).json({ message: "Could not delete event." });
    }
  }
);

// ================= STUDENT REGISTRATION =================

app.post(
  "/api/events/:id/register",
  verifyToken,
  studentOnly,
  async (req, res) => {
    const eventId = validId(req.params.id);
    if (!eventId) return res.status(400).json({ message: "Invalid event ID." });

    const transaction = new sql.Transaction();

    try {
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

      // Lock the event row while checking capacity and inserting a registration.
      const eventRequest = new sql.Request(transaction);
      eventRequest.input("id", sql.Int, eventId);

      const eventResult = await eventRequest.query(`
        SELECT id, title, event_date, capacity
        FROM Events WITH (UPDLOCK, HOLDLOCK)
        WHERE id = @id
      `);

      if (!eventResult.recordset.length) {
        await transaction.rollback();
        return res.status(404).json({ message: "Event not found." });
      }

      const event = eventResult.recordset[0];

      if (new Date(event.event_date).getTime() < Date.now()) {
        await transaction.rollback();
        return res.status(400).json({ message: "This event has already started or ended." });
      }

      const countRequest = new sql.Request(transaction);
      countRequest.input("event_id", sql.Int, eventId);
      const countResult = await countRequest.query(`
        SELECT COUNT(*) AS total
        FROM EventRegistrations
        WHERE event_id = @event_id
      `);

      if (
        event.capacity !== null &&
        countResult.recordset[0].total >= event.capacity
      ) {
        await transaction.rollback();
        return res.status(409).json({ message: "Sorry, this event is full." });
      }

      const insert = new sql.Request(transaction);
      insert.input("user_id", sql.Int, req.user.id);
      insert.input("event_id", sql.Int, eventId);

      await insert.query(`
        INSERT INTO EventRegistrations (user_id, event_id)
        VALUES (@user_id, @event_id)
      `);

      await transaction.commit();

      res.status(201).json({
        message: "You are registered for this event!",
        event
      });
    } catch (error) {
      try { await transaction.rollback(); } catch {}

      if (error.number === 2601 || error.number === 2627) {
        return res.status(409).json({
          message: "You have already registered for this event."
        });
      }

      console.error("Event registration error:", error.message);
      res.status(500).json({ message: "Could not register for this event." });
    }
  }
);

app.get(
  "/api/my-registrations",
  verifyToken,
  studentOnly,
  async (req, res) => {
    try {
      const request = new sql.Request();
      request.input("user_id", sql.Int, req.user.id);

      const result = await request.query(`
        SELECT e.id AS event_id, e.title, e.category, e.venue,
               e.event_date, e.image_url, e.capacity, r.registered_at
        FROM EventRegistrations r
        INNER JOIN Events e ON e.id = r.event_id
        WHERE r.user_id = @user_id
        ORDER BY e.event_date ASC
      `);

      res.json(result.recordset);
    } catch (error) {
      console.error("My registrations error:", error.message);
      res.status(500).json({ message: "Could not fetch your registrations." });
    }
  }
);

app.delete(
  "/api/my-registrations/:eventId",
  verifyToken,
  studentOnly,
  async (req, res) => {
    try {
      const eventId = validId(req.params.eventId);
      if (!eventId) {
        return res.status(400).json({ message: "Invalid event ID." });
      }

      const request = new sql.Request();
      request.input("user_id", sql.Int, req.user.id);
      request.input("event_id", sql.Int, eventId);

      const result = await request.query(`
        DELETE FROM EventRegistrations
        WHERE user_id = @user_id AND event_id = @event_id
      `);

      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({
          message: "You are not registered for this event."
        });
      }

      res.json({ message: "Your registration has been cancelled." });
    } catch (error) {
      console.error("Cancel registration error:", error.message);
      res.status(500).json({ message: "Could not cancel registration." });
    }
  }
);

// Centralized upload and request error handling.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE"
      ? "Image must be 5 MB or smaller."
      : error.message;
    return res.status(400).json({ message });
  }

  if (error) return res.status(400).json({ message: error.message });
  next();
});

async function startServer() {
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET missing from backend/.env");
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < 32) {
    console.error("JWT_SECRET must be at least 32 characters long.");
    process.exit(1);
  }

  const connected = await connectDB();
  if (!connected) {
    console.error("Database connection failed.");
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Campus Pulse API running at http://localhost:${PORT}`);
  });
}

startServer();
