import express, { Express, Request, Response } from "express";
import cors from "cors";

const app: Express = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.get("/api", (req: Request, res: Response) => {
  res.json({ message: "Hello from my Express + TypeScript API!" });
});

app.listen(port, () => {
  console.log(`[server]: API server is running at http://localhost:${port}`);
});
