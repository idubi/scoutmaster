import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";

// const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbyIwBD5iPSNDoLt0fwdQ0wGJTsqGWV2pS8rS65mzHg96lSb-n4Ul2OAtR-t2DsHbD7G/exec';
const GOOGLE_SHEET_URL = 'https://script.google.com/macros/s/AKfycbzFojjlLmw3jM0Xkds4soG4hnPtDsDRXDHTQT8vV-QXWj7a1Z-qGfC-QxlK-FoUcOyIkQ/exec';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Proxy for fetching history
  app.get("/api/history", async (req, res) => {
    const { targetSheetId, sheetName } = req.query;
    const url = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}${sheetName ? `&sheetName=${encodeURIComponent(sheetName as string)}` : ''}`;
    
    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    console.log(`Proxy: Fetching history for sheet: ${sheetName}`);
    console.log(`Proxy: Target URL: ${url}`);
    
    try {
      const response = await fetch(url, { redirect: 'follow' });
      const text = await response.text();

      if (response.ok) {
        if (text.includes("Der Bereich muss mindestens 1 Spalte enthalten") || 
            text.includes("The range must contain at least one column")) {
          console.warn("Proxy: Sheet is empty or missing headers. Returning empty array.");
          return res.json([]);
        }
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
    const { targetSheetId, sheetName, recordType } = req.body;
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
      
      if (responseText.includes("Original sheet not found")) {
        return res.status(404).json({ 
          error: "Sheet not found",
          message: `The sheet "${sheetName}" was not found in the spreadsheet.`
        });
      }

      // Aggregation Logic for TEAMS_GRADES
      if (recordType === 'MATCH_COMPLETE') {
        try {
          await updateTeamsGrades(targetSheetId, req.body);
        } catch (aggError) {
          console.error("Aggregation Error:", aggError);
          // We don't fail the main sync if aggregation fails, but we log it
        }
      }
      
      res.status(response.status).send(responseText);
    } catch (error) {
      console.error("Proxy sync error:", error);
      res.status(500).json({ error: "Internal server error during proxy sync" });
    }
  });

  async function updateTeamsGrades(targetSheetId: string, matchData: any) {
    const TEAMS_GRADES_SHEET = 'TEAMS_GRADES';
    const TEAMS_GRADES_HEADERS = [
      'TeamNumber', 'GAMES_COUNT', 'TOTAL_TELEOP_HIT', 'TOTAL_AUTONOMUS_HIT', 
      'TOTAL_TELEOP_MISS', 'TOTAL_AUTONOMUS_MISS', 'TOTAL_IS_FULL_PARKING', 'TOTAL_FOULS'
    ];

    const teamNumber = String(matchData.teamScouted);
    
    // 1. Fetch current TEAMS_GRADES data
    const fetchUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${TEAMS_GRADES_SHEET}`;
    const fetchResponse = await fetch(fetchUrl, { redirect: 'follow' });
    const fetchText = await fetchResponse.text();
    
    let currentData: any[] = [];
    if (fetchResponse.ok && !fetchText.includes("not found") && !fetchText.includes("at least one column")) {
      try {
        currentData = JSON.parse(fetchText);
      } catch (e) {
        console.warn("Could not parse TEAMS_GRADES data, assuming empty.");
      }
    }

    // 2. Find existing row
    const existingRowIndex = currentData.findIndex(row => String(row.TeamNumber) === teamNumber);
    let updatedRow: any;

    // Data Type Conversion & Extraction
    const teleHit = Number(matchData.teleBallHit || 0);
    const autoHit = Number(matchData.autoBallHit || 0);
    const teleMiss = Number(matchData.teleBallMiss || 0);
    const autoMiss = Number(matchData.autoBallMiss || 0);
    const isFullParking = matchData.teleFullParking ? 1 : 0;
    const fouls = (matchData.teleGateFoul ? 1 : 0) + 
                  (matchData.teleParkingFoul ? 1 : 0) + 
                  (matchData.teleIntakeFoul ? 1 : 0);

    if (existingRowIndex !== -1) {
      const existingRow = currentData[existingRowIndex];
      updatedRow = {
        TeamNumber: teamNumber,
        GAMES_COUNT: Number(existingRow.GAMES_COUNT || 0) + 1,
        TOTAL_TELEOP_HIT: Number(existingRow.TOTAL_TELEOP_HIT || 0) + teleHit,
        TOTAL_AUTONOMUS_HIT: Number(existingRow.TOTAL_AUTONOMUS_HIT || 0) + autoHit,
        TOTAL_TELEOP_MISS: Number(existingRow.TOTAL_TELEOP_MISS || 0) + teleMiss,
        TOTAL_AUTONOMUS_MISS: Number(existingRow.TOTAL_AUTONOMUS_MISS || 0) + autoMiss,
        TOTAL_IS_FULL_PARKING: Number(existingRow.TOTAL_IS_FULL_PARKING || 0) + isFullParking,
        TOTAL_FOULS: Number(existingRow.TOTAL_FOULS || 0) + fouls
      };
    } else {
      updatedRow = {
        TeamNumber: teamNumber,
        GAMES_COUNT: 1,
        TOTAL_TELEOP_HIT: teleHit,
        TOTAL_AUTONOMUS_HIT: autoHit,
        TOTAL_TELEOP_MISS: teleMiss,
        TOTAL_AUTONOMUS_MISS: autoMiss,
        TOTAL_IS_FULL_PARKING: isFullParking,
        TOTAL_FOULS: fouls
      };
    }

    // 3. Upsert to Google Sheet
    // We use action=upsert if the script supports it, or just POST if it appends.
    // Given the requirement "Update the existing row", we'll try to use an action that handles it.
    // If the script doesn't support upsert, we might need a different approach, 
    // but typically these scripts support 'action' parameter.
    const upsertUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${TEAMS_GRADES_SHEET}`;
    await fetch(upsertUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...updatedRow,
        targetSheetId,
        sheetName: TEAMS_GRADES_SHEET,
        headers: TEAMS_GRADES_HEADERS,
        action: 'upsert', // Custom action assumption
        keyField: 'TeamNumber'
      }),
      redirect: 'follow'
    });
  }

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
          newSheetName,
          headers: req.body.headers
        }),
        redirect: 'follow'
      });
      
      const responseText = await response.text();
      console.log(`Proxy: Google Response: ${responseText}`);
      
      if (responseText.includes("Original sheet not found")) {
        return res.status(404).json({ 
          error: "Sheet not found",
          message: `The sheet "${oldSheetName}" was not found in the spreadsheet.`
        });
      }
      
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
