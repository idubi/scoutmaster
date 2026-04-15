import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { calculateTeamGrade } from "./lib/gradingEngine";
import { TeamAggregatedData } from "./types";
import {ENV}  from "./constants";


const GOOGLE_SHEET_URL = ENV.GOOGLE_SHEET_URL;

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
        }
      }
      
      res.status(response.status).send(responseText);
    } catch (error) {
      console.error("Proxy sync error:", error);
      res.status(500).json({ error: "Internal server error during proxy sync" });
    }
  });

  app.post("/api/recalculate", async (req, res) => {
    const { targetSheetId } = req.body;
    try {
      await updateTeamsGrades(targetSheetId);
      res.json({ status: "success", message: "Grades recalculated and consolidated" });
    } catch (error: any) {
      console.error("Recalculation error:", error);
      if (error.message === "SHEET_BLANK_ERROR") {
        res.status(500).json({ error: "The TEAMS_GRADES sheet is completely blank (0 columns), causing the Google Apps Script to crash. Please DELETE the TEAMS_GRADES sheet entirely from your Google Spreadsheet, then click Recalculate again to recreate it properly." });
      } else {
        res.status(500).json({ error: "Failed to recalculate grades: " + (error.message || "Unknown error") });
      }
    }
  });

  async function updateTeamsGrades(targetSheetId: string, newMatchData?: any) {
    const TEAMS_GRADES_SHEET = 'TEAMS_GRADES';
    const RAW_DATA_SHEET = 'scoutsmaster_ongoing';
    const TEAMS_GRADES_HEADERS = [
      'TeamNumber', 'GAMES_COUNT', 'TOTAL_TELEOP_HIT', 'TOTAL_AUTONOMUS_HIT', 
      'TOTAL_TELEOP_MISS', 'TOTAL_AUTONOMUS_MISS', 'TOTAL_IS_FULL_PARKING', 
      'TOTAL_FOULS', 'TOTAL_GATE_FOULS', 'TOTAL_PARKING_FOULS', 'TOTAL_INTAKE_FOULS',
      'GRADE', 'RATIO', 'RANK'
    ];

    try {
      console.log(`[Recalculate] Starting aggregation for targetSheetId: ${targetSheetId}`);
      const consolidatedMap = new Map<string, TeamAggregatedData>();

      if (newMatchData) {
        // --- INCREMENTAL UPDATE ---
        // 1. Fetch current TEAMS_GRADES
        const fetchUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${TEAMS_GRADES_SHEET}`;
        const fetchResponse = await fetch(fetchUrl, { redirect: 'follow' });
        const fetchText = await fetchResponse.text();
        
        if (fetchResponse.ok && !fetchText.includes("not found")) {
          try {
            const currentGrades = JSON.parse(fetchText);
            if (Array.isArray(currentGrades)) {
              currentGrades.forEach((row: any) => {
                if (row.TeamNumber) {
                  consolidatedMap.set(String(row.TeamNumber), {
                    TeamNumber: String(row.TeamNumber),
                    GAMES_COUNT: Number(row.GAMES_COUNT || 0),
                    TOTAL_TELEOP_HIT: Number(row.TOTAL_TELEOP_HIT || 0),
                    TOTAL_AUTONOMUS_HIT: Number(row.TOTAL_AUTONOMUS_HIT || 0),
                    TOTAL_TELEOP_MISS: Number(row.TOTAL_TELEOP_MISS || 0),
                    TOTAL_AUTONOMUS_MISS: Number(row.TOTAL_AUTONOMUS_MISS || 0),
                    TOTAL_IS_FULL_PARKING: Number(row.TOTAL_IS_FULL_PARKING || 0),
                    TOTAL_FOULS: Number(row.TOTAL_FOULS || 0),
                    TOTAL_GATE_FOULS: Number(row.TOTAL_GATE_FOULS || 0),
                    TOTAL_PARKING_FOULS: Number(row.TOTAL_PARKING_FOULS || 0),
                    TOTAL_INTAKE_FOULS: Number(row.TOTAL_INTAKE_FOULS || 0),
                    GRADE: Number(row.GRADE || 0),
                    RATIO: Number(row.RATIO || 0),
                    RANK: Number(row.RANK || 0)
                  });
                }
              });
            }
          } catch (e) {
            console.warn("Could not parse existing grades for incremental update. Falling back to full recalculation.");
            return updateTeamsGrades(targetSheetId); // Fallback to full
          }
        }

        // 2. Update the specific team from newMatchData
        const teamNumber = String(newMatchData.teamScouted || newMatchData['מספר קבוצה'] || '').trim();
        if (teamNumber) {
          const teleHit = Number(newMatchData.teleBallHit || newMatchData['טלאופ - כדור מנוקד'] || 0);
          const autoHit = Number(newMatchData.autoBallHit || newMatchData['אוטונומי - כדור מנוקד'] || 0);
          const teleMiss = Number(newMatchData.teleBallMiss || 0);
          const autoMiss = Number(newMatchData.autoBallMiss || newMatchData['אוטונומי - כדורים שהוחטאו'] || 0);
          
          let isFullParking = 0;
          if (newMatchData.teleFullParking !== undefined) {
            isFullParking = newMatchData.teleFullParking ? 1 : 0;
          } else if (newMatchData['טלאופ - חניה'] === 'חניה מלאה') {
            isFullParking = 1;
          }

          const gateFoul = Number(newMatchData.teleGateFoul || 0);
          const parkingFoul = Number(newMatchData.teleParkingFoul || 0);
          const intakeFoul = Number(newMatchData.teleIntakeFoul || 0);
          let fouls = gateFoul + parkingFoul + intakeFoul;
          if (fouls === 0 && newMatchData.teleFoulCount) {
            fouls = Number(newMatchData.teleFoulCount);
          }

          if (consolidatedMap.has(teamNumber)) {
            const existing = consolidatedMap.get(teamNumber)!;
            existing.GAMES_COUNT += 1;
            existing.TOTAL_TELEOP_HIT += teleHit;
            existing.TOTAL_AUTONOMUS_HIT += autoHit;
            existing.TOTAL_TELEOP_MISS += teleMiss;
            existing.TOTAL_AUTONOMUS_MISS += autoMiss;
            existing.TOTAL_IS_FULL_PARKING += isFullParking;
            existing.TOTAL_FOULS += fouls;
            existing.TOTAL_GATE_FOULS += gateFoul;
            existing.TOTAL_PARKING_FOULS += parkingFoul;
            existing.TOTAL_INTAKE_FOULS += intakeFoul;
          } else {
            consolidatedMap.set(teamNumber, {
              TeamNumber: teamNumber,
              GAMES_COUNT: 1,
              TOTAL_TELEOP_HIT: teleHit,
              TOTAL_AUTONOMUS_HIT: autoHit,
              TOTAL_TELEOP_MISS: teleMiss,
              TOTAL_AUTONOMUS_MISS: autoMiss,
              TOTAL_IS_FULL_PARKING: isFullParking,
              TOTAL_FOULS: fouls,
              TOTAL_GATE_FOULS: gateFoul,
              TOTAL_PARKING_FOULS: parkingFoul,
              TOTAL_INTAKE_FOULS: intakeFoul,
              GRADE: 0,
              RATIO: 0,
              RANK: 0
            });
          }
        }
      } else {
        // --- FULL RECALCULATION (Manual) ---
        const fetchUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${RAW_DATA_SHEET}`;
        const fetchResponse = await fetch(fetchUrl, { redirect: 'follow' });
        const fetchText = await fetchResponse.text();
        
        let rawData: any[] = [];
        if (fetchResponse.ok && !fetchText.includes("not found")) {
          try {
            const parsed = JSON.parse(fetchText);
            rawData = Array.isArray(parsed) ? parsed : [];
          } catch (e) {
            console.warn("Could not parse raw data for aggregation.");
          }
        }

        rawData.forEach(match => {
          const recType = match.recordType || match['recordType'];
          if (recType && recType !== 'MATCH_COMPLETE') return;
          
          const teamNumber = String(match.teamScouted || match['מספר קבוצה'] || '').trim();
          if (!teamNumber) return;

          const teleHit = Number(match.teleBallHit || match['טלאופ - כדור מנוקד'] || 0);
          const autoHit = Number(match.autoBallHit || match['אוטונומי - כדור מנוקד'] || 0);
          const teleMiss = Number(match.teleBallMiss || 0);
          const autoMiss = Number(match.autoBallMiss || match['אוטונומי - כדורים שהוחטאו'] || 0);
          
          let isFullParking = 0;
          if (match.teleFullParking !== undefined) {
            isFullParking = match.teleFullParking ? 1 : 0;
          } else if (match['טלאופ - חניה'] === 'חניה מלאה') {
            isFullParking = 1;
          }

          const gateFoul = Number(match.teleGateFoul || 0);
          const parkingFoul = Number(match.teleParkingFoul || 0);
          const intakeFoul = Number(match.teleIntakeFoul || 0);
          let fouls = gateFoul + parkingFoul + intakeFoul;
          if (fouls === 0 && match.teleFoulCount) {
            fouls = Number(match.teleFoulCount);
          }

          if (consolidatedMap.has(teamNumber)) {
            const existing = consolidatedMap.get(teamNumber)!;
            existing.GAMES_COUNT += 1;
            existing.TOTAL_TELEOP_HIT += teleHit;
            existing.TOTAL_AUTONOMUS_HIT += autoHit;
            existing.TOTAL_TELEOP_MISS += teleMiss;
            existing.TOTAL_AUTONOMUS_MISS += autoMiss;
            existing.TOTAL_IS_FULL_PARKING += isFullParking;
            existing.TOTAL_FOULS += fouls;
            existing.TOTAL_GATE_FOULS += gateFoul;
            existing.TOTAL_PARKING_FOULS += parkingFoul;
            existing.TOTAL_INTAKE_FOULS += intakeFoul;
          } else {
            consolidatedMap.set(teamNumber, {
              TeamNumber: teamNumber,
              GAMES_COUNT: 1,
              TOTAL_TELEOP_HIT: teleHit,
              TOTAL_AUTONOMUS_HIT: autoHit,
              TOTAL_TELEOP_MISS: teleMiss,
              TOTAL_AUTONOMUS_MISS: autoMiss,
              TOTAL_IS_FULL_PARKING: isFullParking,
              TOTAL_FOULS: fouls,
              TOTAL_GATE_FOULS: gateFoul,
              TOTAL_PARKING_FOULS: parkingFoul,
              TOTAL_INTAKE_FOULS: intakeFoul,
              GRADE: 0,
              RATIO: 0,
              RANK: 0
            });
          }
        });
      }

      // 3. Calculate Grades and Ratios for all teams
      const teamsList = Array.from(consolidatedMap.values()).map(team => {
        const { grade, ratio } = calculateTeamGrade(team);
        return { ...team, GRADE: grade, RATIO: ratio }; 
      });

      // 4. Sort by Grade and assign Rank
      teamsList.sort((a, b) => b.GRADE - a.GRADE);
      teamsList.forEach((team, index) => {
        team.RANK = index + 1;
      });

      // 5. Recreate the TEAMS_GRADES sheet (requires updated Google Apps Script)
      console.log(`[Recalculate] Sending recreate command for sheet ${TEAMS_GRADES_SHEET}...`);
      const recreateUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${TEAMS_GRADES_SHEET}&action=recreate`;
      const recreateRes = await fetch(recreateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'recreate', 
          targetSheetId, 
          sheetName: TEAMS_GRADES_SHEET,
          headers: TEAMS_GRADES_HEADERS
        }),
        redirect: 'follow'
      });
      const recreateText = await recreateRes.text();
      console.log(`[Recalculate] Recreate response: ${recreateText}`);
      
      if (recreateText.includes("Error")) {
        console.warn(`[Recalculate] Warning during recreate: ${recreateText}`);
        if (recreateText.includes("mindestens 1 Spalte") || recreateText.includes("at least 1 column")) {
          throw new Error("SHEET_BLANK_ERROR");
        }
      }

      // 6. Write the fresh, consolidated data back to the sheet
      console.log(`[Recalculate] Appending ${teamsList.length} teams to ${TEAMS_GRADES_SHEET}...`);
      const appendUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${TEAMS_GRADES_SHEET}`;
      for (const team of teamsList) {
        const appendRes = await fetch(appendUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...team,
            targetSheetId,
            sheetName: TEAMS_GRADES_SHEET,
            headers: TEAMS_GRADES_HEADERS
          }),
          redirect: 'follow'
        });
        const appendText = await appendRes.text();
        if (appendText.includes("Error")) {
          console.error(`[Recalculate] Failed to append team ${team.TeamNumber}: ${appendText}`);
          if (appendText.includes("mindestens 1 Spalte") || appendText.includes("at least 1 column") || appendText.includes("at least one column")) {
            throw new Error("SHEET_BLANK_ERROR");
          }
        } else {
          console.log(`[Recalculate] Successfully appended team ${team.TeamNumber}.`);
        }
      }
    } catch (error) {
      console.error("Error in updateTeamsGrades:", error);
      throw error;
    }
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
