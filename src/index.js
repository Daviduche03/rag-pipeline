import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Agent from "./agent.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

app.post("/query", async (req, res) => {
  try {
    const { query } = req.body;
    const messages = [
      {
        role: "user",
        content: query,
      },
    ];
    const result = await new Agent().processMessage(messages);
    console.log(result);
    res.json(result);
  } catch (error) {
    console.error("Error generating text:", error);
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
