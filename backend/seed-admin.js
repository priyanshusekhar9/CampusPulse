
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      name: {
        type: String,
        required: true
      },
      email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
      },
      password_hash: {
        type: String,
        required: true
      },
      role: {
        type: String,
        default: "student"
      }
    },
    {
      collection: "users",
      timestamps: false
    }
  )
);

async function main() {
  const {
    MONGODB_URI,
    ADMIN_NAME,
    ADMIN_EMAIL,
    ADMIN_PASSWORD
  } = process.env;

  // Check required environment variables
  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is missing in backend/.env");
  }

  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error(
      "ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD are required in .env"
    );
  }

  if (ADMIN_PASSWORD.length < 12) {
    throw new Error(
      "ADMIN_PASSWORD must be at least 12 characters long."
    );
  }

  console.log("Connecting to MongoDB Atlas...");

  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000
  });

  console.log("MongoDB connected successfully.");

  const email = ADMIN_EMAIL.trim().toLowerCase();
  const name = ADMIN_NAME.trim();
  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  let user = await User.findOne({ email });

  if (user) {
    user.name = name;
    user.password_hash = password_hash;
    user.role = "admin";

    await user.save();

    console.log("Existing user updated to admin.");
  } else {
    await User.create({
      name,
      email,
      password_hash,
      role: "admin"
    });

    console.log("New admin user created.");
  }

  console.log("Admin account is ready.");
}

main()
  .catch((error) => {
    console.error("\n========== SETUP FAILED ==========");
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    console.error("Error code:", error.code || "N/A");

    if (error.cause) {
      console.error("Underlying cause:", error.cause);
    }

    if (error.reason) {
      console.error("Connection reason:", error.reason);
    }

    console.error("==================================");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }
  });
