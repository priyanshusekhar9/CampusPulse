require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

// -------------------- CORS --------------------

const allowedOrigins = (
  process.env.CLIENT_ORIGIN ||
  "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174,http://localhost:5175,http://127.0.0.1:5175,http://localhost:5176,http://127.0.0.1:5176"
).split(",").map(x => x.trim()).filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("CORS blocked origin: " + origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "100kb" }));
app.use("/uploads", express.static(uploadDir));

// -------------------- LOGIN LIMIT --------------------

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many attempts. Try again in 15 minutes."
  }
});

// -------------------- MONGODB MODELS --------------------

const User = mongoose.model("User", new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 255
  },
  password_hash: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ["student", "admin"],
    default: "student"
  }
}, {
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
}));

const Event = mongoose.model("Event", new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ""
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  venue: {
    type: String,
    required: true,
    trim: true
  },
  event_date: {
    type: Date,
    required: true
  },
  registration_deadline: {
    type: Date,
    default: null
  },
  image_url: {
    type: String,
    default: null
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  capacity: {
    type: Number,
    min: 1,
    default: null
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null
  }
}, {
  timestamps: {
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
}));

const Registration = mongoose.model(
  "EventRegistration",
  new mongoose.Schema({
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    event_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true
    },
    registered_at: {
      type: Date,
      default: Date.now
    }
  })
);

Registration.schema.index(
  { user_id: 1, event_id: 1 },
  { unique: true }
);

const EventActivityLog = mongoose.model(
  "EventActivityLog",
  new mongoose.Schema({
    event_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null
    },
    event_title: {
      type: String,
      default: ""
    },
    admin_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    admin_email: {
      type: String,
      default: ""
    },
    action: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ""
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    created_at: {
      type: Date,
      default: Date.now,
      index: true
    }
  })
);

// -------------------- ACTIVITY LOG HELPER --------------------

async function writeActivity(req, event, action, description, details = {}) {
  try {
    await EventActivityLog.create({
      event_id: event?._id || null,
      event_title: event?.title || "",
      admin_id: req.user?.id || null,
      admin_email: req.user?.email || "",
      action,
      description,
      details
    });
  } catch (err) {
    console.error("Activity log error:", err.message);
  }
}

// -------------------- IMAGE UPLOAD --------------------

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    cb(
      null,
      `event-${Date.now()}${path.extname(file.originalname).toLowerCase()}`
    );
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (_req, file, cb) => {
    if (
      ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)
    ) {
      return cb(null, true);
    }

    cb(new Error("Only JPG, PNG and WebP images are allowed."));
  }
});

// -------------------- HELPERS --------------------

const validId = id => mongoose.isValidObjectId(id);

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Please log in first."
    });
  }

  try {
    req.user = jwt.verify(
      header.slice(7),
      process.env.JWT_SECRET
    );

    next();
  } catch {
    return res.status(401).json({
      message: "Invalid or expired token. Log in again."
    });
  }
}

function admin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      message: "Admin access required."
    });
  }

  next();
}

function student(req, res, next) {
  if (req.user.role !== "student") {
    return res.status(403).json({
      message: "Student account required."
    });
  }

  next();
}

function makeToken(user) {
  return jwt.sign(
    {
      id: String(user._id),
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET,
    { expiresIn: "2h" }
  );
}

function publicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function removeFile(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error(err.message);
    }
  }
}

function removePoster(url) {
  if (url?.startsWith("/uploads/")) {
    removeFile(path.join(uploadDir, path.basename(url)));
  }
}

function parseCapacity(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const n = Number(value);

  return Number.isSafeInteger(n) && n > 0 ? n : NaN;
}

function parseEvent(body) {
  const title = String(body.title || "").trim();
  const category = String(body.category || "").trim();
  const venue = String(body.venue || "").trim();

  const date = new Date(body.event_date);

  const deadline = body.registration_deadline
    ? new Date(body.registration_deadline)
    : null;

  const capacity = parseCapacity(body.capacity);

  if (!title || !category || !venue || !body.event_date) {
    return {
      error: "Title, category, venue and event date are required."
    };
  }

  if (Number.isNaN(date.getTime())) {
    return { error: "Invalid event date." };
  }

  if (Number.isNaN(capacity)) {
    return {
      error: "Capacity must be a positive whole number or empty."
    };
  }

  if (deadline && Number.isNaN(deadline.getTime())) {
    return { error: "Invalid registration deadline." };
  }

  if (deadline && deadline > date) {
    return {
      error: "Registration deadline cannot be after the event date."
    };
  }

  return {
    value: {
      title,
      description: String(body.description || ""),
      category,
      venue,
      event_date: date,
      registration_deadline: deadline,
      capacity
    }
  };
}

async function eventJson(event) {
  const registered_count = await Registration.countDocuments({
    event_id: event._id
  });

  return {
    id: String(event._id),
    title: event.title,
    description: event.description || "",
    category: event.category,
    venue: event.venue,
    event_date: event.event_date,
    registration_deadline: event.registration_deadline || null,
    image_url: event.image_url || null,
    capacity: event.capacity ?? null,
    registered_count,
    created_by: String(event.created_by),
    isDeleted: event.isDeleted === true,
    deletedAt: event.deletedAt || null
  };
}

async function eventList(query) {
  const docs = await Event.find(query).sort({ event_date: 1 });

  const result = [];

  for (const event of docs) {
    result.push(await eventJson(event));
  }

  return result;
}

// -------------------- HEALTH ROUTES --------------------

app.get("/", (_req, res) => {
  res.send("Campus Pulse API is running!");
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected"
  });
});

app.get("/api/test-db", (_req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      message: "Database is not connected."
    });
  }

  res.json({
    message: "MongoDB connected successfully",
    database: mongoose.connection.name
  });
});

// -------------------- AUTH LOGIN --------------------

app.post("/api/auth/login", authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = req.body.password;

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const user = await User.findOne({ email });

    if (
      !user ||
      !(await bcrypt.compare(password, user.password_hash))
    ) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const account = publicUser(user);

    res.json({
      message: "Login successful.",
      token: makeToken(user),
      ...(user.role === "admin"
        ? { admin: account }
        : { user: account })
    });

  } catch (err) {
    console.error("Login error:", err.message);

    res.status(500).json({
      message: "Login failed."
    });
  }
});

// -------------------- STUDENT REGISTRATION --------------------

app.post("/api/auth/register", authLimiter, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = req.body.password;

    if (!name || !email || typeof password !== "string") {
      return res.status(400).json({
        message: "Name, email and password are required."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        message: "Enter a valid email."
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        message: "Password must be 8–72 characters."
      });
    }

    const user = await User.create({
      name,
      email,
      password_hash: await bcrypt.hash(password, 12),
      role: "student"
    });

    res.status(201).json({
      message: "Student account created successfully.",
      token: makeToken(user),
      user: publicUser(user)
    });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        message: "This email is already registered."
      });
    }

    console.error("Signup error:", err.message);

    res.status(500).json({
      message: "Could not create account."
    });
  }
});

// -------------------- PROFILE --------------------

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "Account not found."
      });
    }

    res.json({
      user: publicUser(user)
    });

  } catch (err) {
    console.error(err.message);

    res.status(500).json({
      message: "Could not load profile."
    });
  }
});

app.patch("/api/auth/me", auth, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();

    if (!name || name.length > 100) {
      return res.status(400).json({
        message: "Enter a valid name."
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({
        message: "Account not found."
      });
    }

    res.json({
      message: "Profile updated.",
      user: publicUser(user)
    });

  } catch (err) {
    console.error(err.message);

    res.status(500).json({
      message: "Could not update profile."
    });
  }
});

// -------------------- PUBLIC EVENTS --------------------

// $ne:true also includes older records without isDeleted field.

app.get("/api/events", async (_req, res) => {
  try {
    res.json(
      await eventList({
        isDeleted: { $ne: true },
        event_date: { $gt: new Date() }
      })
    );

  } catch (err) {
    console.error(err.message);

    res.status(500).json({
      message: "Could not fetch events."
    });
  }
});

// -------------------- ADMIN CREATE EVENT --------------------

app.post(
  "/api/events",
  auth,
  admin,
  upload.single("image"),
  async (req, res) => {
    try {
      const parsed = parseEvent(req.body);

      if (parsed.error) {
        removeFile(req.file?.path);

        return res.status(400).json({
          message: parsed.error
        });
      }

      const event = await Event.create({
        ...parsed.value,
        image_url: req.file
          ? `/uploads/${req.file.filename}`
          : null,
        created_by: req.user.id,
        isDeleted: false,
        deletedAt: null,
        deletedBy: null
      });

      await writeActivity(
        req,
        event,
        "CREATE",
        `Created event: ${event.title}`
      );

      res.status(201).json({
        message: "Event created successfully!",
        event: await eventJson(event)
      });

    } catch (err) {
      removeFile(req.file?.path);

      console.error(err.message);

      res.status(500).json({
        message: "Could not create event."
      });
    }
  }
);

// -------------------- ADMIN EDIT EVENT --------------------

app.put(
  "/api/events/:id",
  auth,
  admin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!validId(req.params.id)) {
        removeFile(req.file?.path);

        return res.status(400).json({
          message: "Invalid event ID."
        });
      }

      const parsed = parseEvent(req.body);

      if (parsed.error) {
        removeFile(req.file?.path);

        return res.status(400).json({
          message: parsed.error
        });
      }

      const event = await Event.findOne({
        _id: req.params.id,
        isDeleted: { $ne: true }
      });

      if (!event) {
        removeFile(req.file?.path);

        return res.status(404).json({
          message: "Event not found."
        });
      }

      const oldImage = event.image_url;

      Object.assign(event, parsed.value);

      if (req.file) {
        event.image_url = `/uploads/${req.file.filename}`;
      }

      await event.save();

      if (req.file) {
        removePoster(oldImage);
      }

      await writeActivity(
        req,
        event,
        "UPDATE",
        `Updated event: ${event.title}`
      );

      res.json({
        message: "Event updated successfully.",
        event: await eventJson(event)
      });

    } catch (err) {
      removeFile(req.file?.path);

      console.error(err.message);

      res.status(500).json({
        message: "Could not update event."
      });
    }
  }
);

// -------------------- ADMIN CHANGE POSTER --------------------

app.put(
  "/api/events/:id/image",
  auth,
  admin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!validId(req.params.id)) {
        removeFile(req.file?.path);

        return res.status(400).json({
          message: "Invalid event ID."
        });
      }

      if (!req.file) {
        return res.status(400).json({
          message: "Select an image."
        });
      }

      const event = await Event.findOne({
        _id: req.params.id,
        isDeleted: { $ne: true }
      });

      if (!event) {
        removeFile(req.file.path);

        return res.status(404).json({
          message: "Event not found."
        });
      }

      const oldImage = event.image_url;

      event.image_url = `/uploads/${req.file.filename}`;

      await event.save();

      removePoster(oldImage);

      await writeActivity(
        req,
        event,
        "POSTER_UPDATED",
        `Updated poster for ${event.title}`
      );

      res.json({
        message: "Poster updated.",
        event: await eventJson(event)
      });

    } catch (err) {
      removeFile(req.file?.path);

      console.error(err.message);

      res.status(500).json({
        message: "Could not update poster."
      });
    }
  }
);

// -------------------- ADMIN VIEW ATTENDEES --------------------

app.get(
  "/api/events/:id/registrations",
  auth,
  admin,
  async (req, res) => {
    try {
      if (!validId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid event ID."
        });
      }

      const event = await Event.findById(req.params.id);

      if (!event) {
        return res.status(404).json({
          message: "Event not found."
        });
      }

      const registrations = await Registration.find({
        event_id: event._id
      })
        .sort({ registered_at: -1 })
        .populate("user_id", "name email");

      const attendees = registrations
        .filter(r => r.user_id)
        .map(r => ({
          id: String(r.user_id._id),
          registration_id: String(r._id),
          name: r.user_id.name,
          email: r.user_id.email,
          registered_at: r.registered_at
        }));

      res.json({
        event: {
          id: String(event._id),
          title: event.title
        },
        total: attendees.length,
        attendees
      });

    } catch (err) {
      console.error(err.message);

      res.status(500).json({
        message: "Could not load attendees."
      });
    }
  }
);

// -------------------- ADMIN REMOVE ATTENDEE --------------------

app.delete(
  "/api/events/:id/registrations/:userId",
  auth,
  admin,
  async (req, res) => {
    try {
      const { id, userId } = req.params;

      if (!validId(id) || !validId(userId)) {
        return res.status(400).json({
          message: "Invalid ID."
        });
      }

      const event = await Event.findById(id);

      if (!event) {
        return res.status(404).json({
          message: "Event not found."
        });
      }

      const registration = await Registration.findOneAndDelete({
        event_id: id,
        user_id: userId
      });

      if (!registration) {
        return res.status(404).json({
          message: "Attendee registration not found."
        });
      }

      const user = await User.findById(userId);

      await writeActivity(
        req,
        event,
        "ATTENDEE_REMOVED",
        `Removed ${user?.name || userId} from ${event.title}`,
        { user_id: userId }
      );

      res.json({
        message: "Attendee removed successfully."
      });

    } catch (err) {
      console.error(err.message);

      res.status(500).json({
        message: "Could not remove attendee."
      });
    }
  }
);

// -------------------- ADMIN SOFT DELETE --------------------

app.delete("/api/events/:id", auth, admin, async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid event ID."
      });
    }

    const event = await Event.findOne({
      _id: req.params.id,
      isDeleted: { $ne: true }
    });

    if (!event) {
      return res.status(404).json({
        message: "Event not found."
      });
    }

    event.isDeleted = true;
    event.deletedAt = new Date();
    event.deletedBy = req.user.id;

    await event.save();

    await writeActivity(
      req,
      event,
      "DELETE",
      `Moved event to Deleted Events: ${event.title}`
    );

    res.json({
      message: "Event moved to Deleted Events successfully."
    });

  } catch (err) {
    console.error(err.message);

    res.status(500).json({
      message: "Could not delete event."
    });
  }
});

// -------------------- ADMIN DELETED EVENTS --------------------

app.get(
  "/api/admin/events/deleted",
  auth,
  admin,
  async (_req, res) => {
    try {
      res.json(
        await eventList({ isDeleted: true })
      );

    } catch (err) {
      console.error(err.message);

      res.status(500).json({
        message: "Could not load deleted events."
      });
    }
  }
);

// -------------------- ADMIN RESTORE EVENT --------------------

app.patch(
  "/api/events/:id/restore",
  auth,
  admin,
  async (req, res) => {
    try {
      if (!validId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid event ID."
        });
      }

      const event = await Event.findOne({
        _id: req.params.id,
        isDeleted: true
      });

      if (!event) {
        return res.status(404).json({
          message: "Deleted event not found."
        });
      }

      event.isDeleted = false;
      event.deletedAt = null;
      event.deletedBy = null;

      await event.save();

      await writeActivity(
        req,
        event,
        "RESTORE",
        `Restored event: ${event.title}`
      );

      res.json({
        message: "Event restored successfully."
      });

    } catch (err) {
      console.error(err.message);

      res.status(500).json({
        message: "Could not restore event."
      });
    }
  }
);

// -------------------- ADMIN PERMANENT DELETE --------------------

app.delete(
  "/api/events/:id/permanent",
  auth,
  admin,
  async (req, res) => {
    try {
      if (!validId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid event ID."
        });
      }

      const event = await Event.findOne({
        _id: req.params.id,
        isDeleted: true
      });

      if (!event) {
        return res.status(404).json({
          message: "Deleted event not found."
        });
      }

      await writeActivity(
        req,
        event,
        "PERMANENT_DELETE",
        `Permanently deleted event: ${event.title}`
      );

      await Registration.deleteMany({
        event_id: event._id
      });

      removePoster(event.image_url);

      await event.deleteOne();

      res.json({
        message: "Event permanently deleted."
      });

    } catch (err) {
      console.error(err.message);

      res.status(500).json({
        message: "Could not permanently delete event."
      });
    }
  }
);

// -------------------- ADMIN PAST EVENTS --------------------

app.get(
  "/api/admin/events/past",
  auth,
  admin,
  async (_req, res) => {
    try {
      res.json(
        await eventList({
          isDeleted: { $ne: true },
          event_date: { $lte: new Date() }
        })
      );

    } catch (err) {
      console.error(err.message);

      res.status(500).json({
        message: "Could not load past events."
      });
    }
  }
);

// -------------------- ADMIN ACTIVITY LOG --------------------

app.get(
  "/api/admin/activity-logs",
  auth,
  admin,
  async (_req, res) => {
    try {
      const logs = await EventActivityLog.find()
        .sort({ created_at: -1 })
        .limit(200)
        .lean();

      res.json(logs);

    } catch (err) {
      console.error(err.message);

      res.status(500).json({
        message: "Could not load activity logs."
      });
    }
  }
);

// -------------------- STUDENT EVENT REGISTRATION --------------------

app.post(
  "/api/events/:id/register",
  auth,
  student,
  async (req, res) => {
    try {
      if (!validId(req.params.id)) {
        return res.status(400).json({
          message: "Invalid event ID."
        });
      }

      const event = await Event.findOne({
        _id: req.params.id,
        isDeleted: { $ne: true }
      });

      if (!event) {
        return res.status(404).json({
          message: "Event not found."
        });
      }

      const now = new Date();

      if (event.event_date <= now) {
        return res.status(400).json({
          message: "This event has ended."
        });
      }

      if (
        event.registration_deadline &&
        event.registration_deadline <= now
      ) {
        return res.status(400).json({
          message: "Registration deadline has passed."
        });
      }

      if (event.capacity != null) {
        const count = await Registration.countDocuments({
          event_id: event._id
        });

        if (count >= event.capacity) {
          return res.status(409).json({
            message: "This event is full."
          });
        }
      }

      await Registration.create({
        user_id: req.user.id,
        event_id: event._id
      });

      res.status(201).json({
        message: "Registration successful!"
      });

    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({
          message: "You are already registered."
        });
      }

      console.error(err.message);

      res.status(500).json({
        message: "Could not register for event."
      });
    }
  }
);

// -------------------- STUDENT MY REGISTRATIONS --------------------

app.get(
  "/api/my-registrations",
  auth,
  student,
  async (req, res) => {
    try {
      const registrations = await Registration.find({
        user_id: req.user.id
      })
        .sort({ registered_at: -1 })
        .populate("event_id");

      const output = [];

      for (const registration of registrations) {
        if (!registration.event_id) continue;

        output.push({
          ...(await eventJson(registration.event_id)),
          event_id: String(registration.event_id._id),
          registered_at: registration.registered_at
        });
      }

      res.json(output);

    } catch (err) {
      console.error(err.message);

      res.status(500).json({
        message: "Could not load registrations."
      });
    }
  }
);

// -------------------- STUDENT CANCEL REGISTRATION --------------------

app.delete(
  "/api/my-registrations/:eventId",
  auth,
  student,
  async (req, res) => {
    try {
      if (!validId(req.params.eventId)) {
        return res.status(400).json({
          message: "Invalid event ID."
        });
      }

      const result = await Registration.deleteOne({
        user_id: req.user.id,
        event_id: req.params.eventId
      });

      if (!result.deletedCount) {
        return res.status(404).json({
          message: "Registration not found."
        });
      }

      res.json({
        message: "Registration cancelled successfully."
      });

    } catch (err) {
      console.error(err.message);

      res.status(500).json({
        message: "Could not cancel registration."
      });
    }
  }
);

// -------------------- ERROR HANDLING --------------------

app.use((err, _req, res, _next) => {
  console.error("Request error:", err.message);

  if (err.message?.startsWith("CORS blocked origin:")) {
    return res.status(403).json({
      message: err.message
    });
  }

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      message: "Upload failed. Maximum image size is 5 MB."
    });
  }

  if (err.message?.includes("Only JPG")) {
    return res.status(400).json({
      message: err.message
    });
  }

  res.status(500).json({
    message: "Unexpected server error."
  });
});

app.use((_req, res) => {
  res.status(404).json({
    message: "API route not found."
  });
});

// -------------------- START SERVER --------------------

async function start() {
  if (!process.env.MONGODB_URI) {
    console.error("Missing MONGODB_URI in .env");
    process.exit(1);
  }

  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.length < 32
  ) {
    console.error("JWT_SECRET must be at least 32 characters.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000
    });

    await Promise.all([
      User.init(),
      Event.init(),
      Registration.init(),
      EventActivityLog.init()
    ]);

    console.log("MongoDB connected:", mongoose.connection.name);
    console.log("Allowed frontend origins:", allowedOrigins);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Campus Pulse API running on port ${PORT}`);
    });

  } catch (err) {
    console.error("Startup failed:", err.message);
    process.exit(1);
  }
}

start();