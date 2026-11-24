import express from "express";
import pg from "pg";

const app = express();
const port = 3000;

// Return DATE columns as plain "YYYY-MM-DD" strings (avoids timezone shifts)
pg.types.setTypeParser(1082, (value) => value);

const db = new pg.Client({
  user: "postgres",
  password: "admin",
  host: "localhost",
  port: 5432,
  database: "dashboard",
});

db.connect();

app.set("view engine", "ejs");
app.use(express.static("public"));

const limit = 5; // customers per page
const username = "UTRGV Vaqueros";

// ---------- helpers ----------
const money = (n) =>
  "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

const number = (n) => Number(n || 0).toLocaleString("en-US");

// "2024-03-07" -> "03/07/2024"
const formatDate = (d) => {
  const [y, m, day] = String(d).split("-");
  return `${m}/${day}/${y}`;
};

// test: http://localhost:3000/?page=2
app.get("/", async (req, res) => {
  console.log("Retrieving dashboard data ...");

  try {
    // ---------- Customers (queries 1 & 2) ----------
    const resultCount = await db.query("SELECT count(*) FROM customers");
    const totalCustomers = Number(resultCount.rows[0].count);
    const totalPages = Math.max(1, Math.ceil(totalCustomers / limit));

    let page = Number(req.query.page) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    const offset = (page - 1) * limit;

    const resultCustomers = await db.query(
      "SELECT * FROM customers ORDER BY id LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    const customers = resultCustomers.rows.map((c) => ({
      ...c,
      datejoined: formatDate(c.datejoined),
    }));

    // ---------- Revenue (query 3) ----------
    const resultRevenue = await db.query("SELECT sum(saleamount) FROM sales");
    const revenue = resultRevenue.rows[0].sum;

    // ---------- Sales table (query 4) ----------
    const resultSales = await db.query(`
      SELECT products.name, sales.quantity, sales.saleamount
      FROM sales
      LEFT JOIN products ON
      sales.productid = products.id
      ORDER BY sales.id ASC`);
    const sales = resultSales.rows;

    // ---------- Orders (query 5) ----------
    const resultOrders = await db.query("SELECT count(quantity) FROM orders");
    const orders = resultOrders.rows[0].count;

    // ---------- Issues (queries 6 & 7) ----------
    const resultIssuesCount = await db.query(
      "SELECT count(id) FROM alerts WHERE type = 'issues'"
    );
    const issuesCount = resultIssuesCount.rows[0].count;

    const resultIssues = await db.query(
      "SELECT * FROM alerts WHERE type = 'issues'"
    );
    const issues = resultIssues.rows;

    // ---------- Notifications (queries 8 & 9) ----------
    const resultNotifCount = await db.query(
      "SELECT count(id) FROM alerts WHERE type = 'notifications'"
    );
    const notificationsCount = resultNotifCount.rows[0].count;

    const resultNotifications = await db.query(
      "SELECT * FROM alerts WHERE type = 'notifications'"
    );
    const notifications = resultNotifications.rows;

    // ---------- Tasks (query 10) ----------
    const resultTasks = await db.query(
      "SELECT * FROM alerts WHERE type = 'tasks'"
    );
    const tasks = resultTasks.rows;

    // ---------- Pagination window (show 5 page links around the current one) ----------
    let startPage = Math.max(1, page - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    startPage = Math.max(1, endPage - 4);

    res.render("index.ejs", {
      username,
      revenue: money(revenue),
      totalCustomers: number(totalCustomers),
      orders: number(orders),
      issuesCount,
      notificationsCount,
      sales: sales.map((s) => ({
        name: s.name,
        quantity: number(s.quantity),
        saleamount: money(s.saleamount),
      })),
      customers,
      issues,
      notifications,
      tasks,
      currentPage: page,
      totalPages,
      startPage,
      endPage,
    });
  } catch (err) {
    res.status(500).json({
      error: "Internal server error",
      message: err.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});