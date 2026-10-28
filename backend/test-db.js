
const { sql, connectDB } = require("./db");

async function testDatabase() {
  const connected = await connectDB();

  if (!connected) {
    console.log("Connection failed. Check the error above.");
    return;
  }

  try {
    const result = await sql.query(
      "SELECT DB_NAME() AS databaseName"
    );

    console.log("Database test successful!");
    console.log(result.recordset);
  } catch (error) {
    console.error("Query failed:", error.message);
  } finally {
    await sql.close();
  }
}

testDatabase();
