import express, { Express, Request, Response } from "express";
import cors from "cors";
import { Pool } from "pg";
import * as planData from "./plan.json";

//database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

//create express app
const app: Express = express();
const port = 3000;

app.use(cors());
app.use(express.json());

//setup routes
app.get("/api", (req: Request, res: Response) => {
  res.json({ message: "Express + ts jabro" });
});

//activity route
app.get("/api/activities", async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM activities ORDER BY start_time DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("API: Error querying activities", err);
    res.status(500).json({ error: "internal server error" });
  }
});

// get plan
app.get("/api/plan", (req: Request, res: Response) => {
  try {
    res.json(planData.MainPlan);
  } catch (err) {
    console.error("API: Error reading plan.json", err);
    res.status(500).json({ error: "internal server error" });
  }
});
// start server
app.listen(port, () => {
  console.log(`[server]: API server is running at http://localhost:${port}`);
});
