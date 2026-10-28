
require("dotenv").config();

const bcrypt = require("bcryptjs");
const { sql, connectDB } = require("./db");

async function createAdmin() {
  if (
    !process.env.ADMIN_EMAIL ||
    !process.env.ADMIN_PASSWORD ||
    !process.env.ADMIN_NAME
  ) {
    throw new Error("Admin details are missing from .env");
  }

  const connected = await connectDB();

  if (!connected) {
    throw new Error("Database connection failed.");
  }

  try {
    const passwordHash = await bcrypt.hash(
      process.env.ADMIN_PASSWORD,
      12
    );

    const request = new sql.Request();

    request.input(
      "name",
      sql.NVarChar(100),
      process.env.ADMIN_NAME
    );
    request.input(
      "email",
      sql.NVarChar(255),
      process.env.ADMIN_EMAIL.trim()
    );
    request.input(
      "password_hash",
      sql.NVarChar(255),
      passwordHash
    );

    await request.query(`
      IF EXISTS (
        SELECT 1 FROM Users WHERE email = @email
      )
      BEGIN
        UPDATE Users
        SET name = @name,
            password_hash = @password_hash,
            role = 'admin'
        WHERE email = @email;
      END
      ELSE
      BEGIN
        INSERT INTO Users
          (name, email, password_hash, role)
        VALUES
          (@name, @email, @password_hash, 'admin');
      END
    `);

    console.log("Admin account created or updated successfully.");
    console.log("Admin email:", process.env.ADMIN_EMAIL);
  } catch (error) {
    console.error("Admin setup failed:", error.message);
  } finally {
    await sql.close();
  }
}

createAdmin();
