
const isCloud = Boolean(process.env.DB_SERVER);

const sql = isCloud
  ? require("mssql")
  : require("mssql/msnodesqlv8");

const config = isCloud
  ? {
      server: process.env.DB_SERVER,
      port: Number(process.env.DB_PORT || 1433),
      database: process.env.DB_NAME || "CampusPulse",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: {
        encrypt: true,
        trustServerCertificate: false
      },
      connectionTimeout: 30000,
      requestTimeout: 30000,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      }
    }
  : {
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
    console.error(error.message);
    return false;
  }
}

module.exports = { sql, connectDB };
