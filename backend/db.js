
const sql = require("mssql/msnodesqlv8");

const config = {
  connectionString:
    "Driver={ODBC Driver 17 for SQL Server};Server=LAPTOP-EAJNEES7\\MSSQL;Database=CampusPulse;Trusted_Connection=Yes;TrustServerCertificate=Yes;",
  options: {
    trustedConnection: true,
    trustServerCertificate: true
  }
};

async function connectDB() {
  try {
    await sql.connect(config);
    console.log("SQL Server connected successfully!");
    return true;
  } catch (error) {
    console.error("Database connection failed:");
    console.dir(error, { depth: 5 });
    return false;
  }
}

module.exports = { sql, connectDB };
