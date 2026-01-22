import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
    user: "rakhabimaaryasambarana",
  host: "localhost",
  database: "expense_tracker",
  password: "12345",
  port: 5432
});
