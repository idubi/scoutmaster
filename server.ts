import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";

const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyfFhppWOajluuUoplfPIr6JVNePV87iU6ypWECrcO3MtJD8aDiHqiA4wK3XBZfpAqh/exec';


async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Proxy for fetching history
  app.get("/api/history", async (req, res) => {
    const { targetSheetId, sheetName } = req.query;
    const url = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}${sheetName ? `&sheetName=${encodeURIComponent(sheetName as string)}` : ''}`;
    
    console.log(`Proxy: Fetching history for sheet: ${sheetName}`);
    console.log(`Proxy: Target URL: ${url}`);
    
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const text = await response.text();

      if (response.ok) {
        try {
          const data = JSON.parse(text);
          res.json(data);
        } catch (parseError) {
          console.error("Proxy: Received non-JSON response from Google.");
          console.error("DEBUG: Try opening this URL in your browser to see the error:");
          console.error(url);
          res.status(500).json({ 
            error: "Google Script returned an error page instead of data.",
            url: url
          });
        }
      } else {
        res.status(response.status).json({ error: "Google Script returned an error status." });
      }
    } catch (error) {
      console.error("Proxy fetch error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // API Proxy for syncing data
  app.post("/api/sync", async (req, res) => {
    const { targetSheetId, sheetName } = req.body;
    console.log(`Proxy: SYNC START - Spreadsheet: ${targetSheetId}, Sheet: ${sheetName}`);
    
    try {
      // We send sheetName in BOTH the URL and the JSON body to be 100% sure Google sees it
      const url = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${encodeURIComponent(sheetName || '')}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        redirect: 'follow'
      });
      
      const responseText = await response.text();
      console.log(`Proxy: Google Response: ${responseText}`);
      res.status(response.status).send(responseText);
    } catch (error) {
      console.error("Proxy sync error:", error);
      res.status(500).json({ error: "Internal server error during proxy sync" });
    }
  });

  // API Proxy for initializing/renaming sheet
  app.post("/api/init", async (req, res) => {
    const { targetSheetId, oldSheetName, newSheetName } = req.body;
    console.log(`Proxy: INIT START - Renaming ${oldSheetName} to ${newSheetName}`);
    
    try {
      const url = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&action=init`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'init',
          targetSheetId,
          oldSheetName,
          newSheetName
        }),
        redirect: 'follow'
      });
      
      const responseText = await response.text();
      console.log(`Proxy: Google Response: ${responseText}`);
      res.status(response.status).send(responseText);
    } catch (error) {
      console.error("Proxy init error:", error);
      res.status(500).json({ error: "Internal server error during proxy init" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
