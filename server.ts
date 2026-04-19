import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import { calculateTeamGrade } from "./lib/gradingEngine";
import { TeamAggregatedData } from "./types";
import {ENV}  from "./constants";


const GOOGLE_SHEET_URL = ENV.GOOGLE_SHEET_URL;

// Global settings state (in-memory cache)
let systemSettings = {
  isAutoCalcActive: false,
  calcIntervalSeconds: 80,
  targetSheetId: "",
  lastConsolidationTime: null as string | null
};

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

  // API to get system settings
  app.get("/api/settings", async (req, res) => {
    // Optionally fetch from Google Sheets if we wanted true persistence across server restarts
    // For now, return in-memory
    res.json(systemSettings);
  });

  // API to update system settings
  app.post("/api/settings", async (req, res) => {
    const { isAutoCalcActive, calcIntervalSeconds, targetSheetId, lastConsolidationTime } = req.body;
    
    // Update local cache
    systemSettings = {
      isAutoCalcActive: !!isAutoCalcActive,
      calcIntervalSeconds: Number(calcIntervalSeconds) || 80,
      targetSheetId: targetSheetId || systemSettings.targetSheetId,
      lastConsolidationTime: lastConsolidationTime === undefined ? systemSettings.lastConsolidationTime : lastConsolidationTime
    };

    console.log(`[Settings] Updated: Active=${systemSettings.isAutoCalcActive}, Interval=${systemSettings.calcIntervalSeconds}s, LastPos=${systemSettings.lastConsolidationTime}`);

    // Persist to Google Sheets in a SYSTEM_SETTINGS sheet
    if (systemSettings.targetSheetId) {
      try {
        const SETTINGS_SHEET = 'SYSTEM_SETTINGS';
        const SETTINGS_HEADERS = ['isAutoCalcActive', 'calcIntervalSeconds', 'targetSheetId', 'lastConsolidationTime'];
        
        // Use the recreate logic to always have a clean settings row
        const url = `${GOOGLE_SHEET_URL}?targetSheetId=${systemSettings.targetSheetId}&sheetName=${SETTINGS_SHEET}&action=recreate`;
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'recreate', 
            targetSheetId: systemSettings.targetSheetId, 
            sheetName: SETTINGS_SHEET,
            headers: SETTINGS_HEADERS
          }),
          redirect: 'follow'
        });

        // Append the single row of settings
        await fetch(`${GOOGLE_SHEET_URL}?targetSheetId=${systemSettings.targetSheetId}&sheetName=${SETTINGS_SHEET}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isAutoCalcActive: String(systemSettings.isAutoCalcActive),
            calcIntervalSeconds: String(systemSettings.calcIntervalSeconds),
            targetSheetId: systemSettings.targetSheetId,
            lastConsolidationTime: systemSettings.lastConsolidationTime || "",
            sheetName: SETTINGS_SHEET,
            headers: SETTINGS_HEADERS
          }),
          redirect: 'follow'
        });
      } catch (err) {
        console.error("[Settings] Failed to persist to Google Sheets:", err);
      }
    }

    res.json({ status: "success", settings: systemSettings });
  });

  async function updateTeamsGrades(targetSheetId: string, newMatchData?: any) {
    const TEAMS_GRADES_SHEET = 'TEAMS_GRADES';
    const RAW_DATA_SHEET = 'scoutsmaster_ongoing';
    const TEAMS_GRADES_HEADERS = [
      'TeamNumber', 'GAMES_COUNT', 'TOTAL_TELEOP_HIT', 'TOTAL_AUTONOMUS_HIT', 
      'TOTAL_TELEOP_MISS', 'TOTAL_AUTONOMUS_MISS', 'TOTAL_IS_FULL_PARKING', 
      'TOTAL_AUTO_ZONE_SMALL', 'TOTAL_AUTO_ZONE_BIG', 'TOTAL_TELEOP_ZONE_SMALL', 'TOTAL_TELEOP_ZONE_BIG', 'TOTAL_AUTO_LEAVE',
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
                    TOTAL_AUTO_ZONE_SMALL: Number(row.TOTAL_AUTO_ZONE_SMALL || 0),
                    TOTAL_AUTO_ZONE_BIG: Number(row.TOTAL_AUTO_ZONE_BIG || 0),
                    TOTAL_TELEOP_ZONE_SMALL: Number(row.TOTAL_TELEOP_ZONE_SMALL || 0),
                    TOTAL_TELEOP_ZONE_BIG: Number(row.TOTAL_TELEOP_ZONE_BIG || 0),
                    TOTAL_AUTO_LEAVE: Number(row.TOTAL_AUTO_LEAVE || 0),
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
        const teamNumber = String(newMatchData.teamScouted || '').trim();
        if (teamNumber) {
          const teleHit = Number(newMatchData.teleBallHit || 0);
          const autoHit = Number(newMatchData.autoBallHit || 0);
          const teleMiss = Number(newMatchData.teleBallMiss || 0);
          const autoMiss = Number(newMatchData.autoBallMiss || 0);
          
          let isFullParking = 0;
          if (newMatchData.teleFullParking !== undefined) {
            isFullParking = newMatchData.teleFullParking ? 1 : 0;
          }

          const autoSmall = newMatchData.isAutoZoneSmall ? 1 : 0;
          const autoBig = newMatchData.isAutoZoneBig ? 1 : 0;
          const teleSmall = newMatchData.isTeleopZoneSmall ? 1 : 0;
          const teleBig = newMatchData.isTeleopZoneBig ? 1 : 0;
          const autoLeave = newMatchData.isAutoLeave ? 1 : 0;

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
            existing.TOTAL_AUTO_ZONE_SMALL += autoSmall;
            existing.TOTAL_AUTO_ZONE_BIG += autoBig;
            existing.TOTAL_TELEOP_ZONE_SMALL += teleSmall;
            existing.TOTAL_TELEOP_ZONE_BIG += teleBig;
            existing.TOTAL_AUTO_LEAVE += autoLeave;
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
              TOTAL_AUTO_ZONE_SMALL: autoSmall,
              TOTAL_AUTO_ZONE_BIG: autoBig,
              TOTAL_TELEOP_ZONE_SMALL: teleSmall,
              TOTAL_TELEOP_ZONE_BIG: teleBig,
              TOTAL_AUTO_LEAVE: autoLeave,
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
          
          const teamNumber = String(match.teamScouted || '').trim();
          if (!teamNumber) return;

          const teleHit = Number(match.teleBallHit || 0);
          const autoHit = Number(match.autoBallHit || 0);
          const teleMiss = Number(match.teleBallMiss || 0);
          const autoMiss = Number(match.autoBallMiss || 0);
          
          let isFullParking = 0;
          if (match.teleFullParking !== undefined) {
            isFullParking = match.teleFullParking ? 1 : 0;
          }

          const autoSmall = match.isAutoZoneSmall === true || match.isAutoZoneSmall === 'TRUE' ? 1 : 0;
          const autoBig = match.isAutoZoneBig === true || match.isAutoZoneBig === 'TRUE' ? 1 : 0;
          const teleSmall = match.isTeleopZoneSmall === true || match.isTeleopZoneSmall === 'TRUE' ? 1 : 0;
          const teleBig = match.isTeleopZoneBig === true || match.isTeleopZoneBig === 'TRUE' ? 1 : 0;
          const autoLeave = match.isAutoLeave === true || match.isAutoLeave === 'TRUE' ? 1 : 0;

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
            existing.TOTAL_AUTO_ZONE_SMALL += autoSmall;
            existing.TOTAL_AUTO_ZONE_BIG += autoBig;
            existing.TOTAL_TELEOP_ZONE_SMALL += teleSmall;
            existing.TOTAL_TELEOP_ZONE_BIG += teleBig;
            existing.TOTAL_AUTO_LEAVE += autoLeave;
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
              TOTAL_AUTO_ZONE_SMALL: autoSmall,
              TOTAL_AUTO_ZONE_BIG: autoBig,
              TOTAL_TELEOP_ZONE_SMALL: teleSmall,
              TOTAL_TELEOP_ZONE_BIG: teleBig,
              TOTAL_AUTO_LEAVE: autoLeave,
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

  // --- BACKEND BATCH JOB (Asynchronous Recalculation) ---
  let isJobRunning = false;
  let lastRunTime = 0;

  setInterval(async () => {
    if (!systemSettings.isAutoCalcActive || !systemSettings.targetSheetId) return;

    const now = Date.now();
    const intervalMs = systemSettings.calcIntervalSeconds * 1000;

    if (now - lastRunTime >= intervalMs && !isJobRunning) {
      isJobRunning = true;
      console.log(`[Batch Job] Starting scheduled execution for ${systemSettings.targetSheetId}...`);
      
      try {
        // Step 1: Fetch Raw Data and check for new games
        const RAW_DATA_SHEET = 'scoutsmaster_ongoing';
        const fetchUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${systemSettings.targetSheetId}&sheetName=${RAW_DATA_SHEET}`;
        const fetchResponse = await fetch(fetchUrl, { redirect: 'follow' });
        const fetchText = await fetchResponse.text();
        
        let rawData: any[] = [];
        if (fetchResponse.ok && !fetchText.includes("not found")) {
          rawData = JSON.parse(fetchText);
        }

        // Filter and collect affected teams
        const lastConsolidationDate = systemSettings.lastConsolidationTime ? new Date(systemSettings.lastConsolidationTime) : new Date(0);
        let newestTimestamp = lastConsolidationDate;
        
        const affectedTeams = new Set<string>();
        const validGames = rawData.filter(game => {
          const timestamp = new Date(game.Timestamp || game.timestamp);
          const isNew = timestamp > lastConsolidationDate;
          
          if (isNew) {
            if (timestamp > newestTimestamp) newestTimestamp = timestamp;
            const team = String(game.teamScouted || game['מספר קבוצה'] || '').trim();
            if (team) affectedTeams.add(team);
          }
          return isNew;
        });

        if (affectedTeams.size > 0) {
          console.log(`[Batch Job] Found ${validGames.length} new games affecting ${affectedTeams.size} teams.`);
          
          // Step 2: Recalculate & Update
          // We trigger a full consolidation here because it ensures ranks/aggregates are always correct
          // Given the sheet architecture, a full rewrite is the most reliable way to maintain data integrity
          await updateTeamsGrades(systemSettings.targetSheetId);
          
          // Step 3: Reset the Clock and update settings
          systemSettings.lastConsolidationTime = newestTimestamp.toISOString();
          
          // Persist the new timestamp to SYSTEM_SETTINGS sheet
          const SETTINGS_SHEET = 'SYSTEM_SETTINGS';
          const SETTINGS_HEADERS = ['isAutoCalcActive', 'calcIntervalSeconds', 'targetSheetId', 'lastConsolidationTime'];
          
          await fetch(`${GOOGLE_SHEET_URL}?targetSheetId=${systemSettings.targetSheetId}&sheetName=${SETTINGS_SHEET}&action=recreate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              action: 'recreate', 
              targetSheetId: systemSettings.targetSheetId, 
              sheetName: SETTINGS_SHEET,
              headers: SETTINGS_HEADERS
            }),
            redirect: 'follow'
          });

          await fetch(`${GOOGLE_SHEET_URL}?targetSheetId=${systemSettings.targetSheetId}&sheetName=${SETTINGS_SHEET}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              isAutoCalcActive: String(systemSettings.isAutoCalcActive),
              calcIntervalSeconds: String(systemSettings.calcIntervalSeconds),
              targetSheetId: systemSettings.targetSheetId,
              lastConsolidationTime: systemSettings.lastConsolidationTime,
              sheetName: SETTINGS_SHEET,
              headers: SETTINGS_HEADERS
            }),
            redirect: 'follow'
          });

          console.log(`[Batch Job] Successfully processed batch. Freshness marker: ${systemSettings.lastConsolidationTime}`);
        } else {
          console.log(`[Batch Job] No new games since ${lastConsolidationDate.toLocaleString()}. Skipping.`);
        }
        
        lastRunTime = Date.now();
      } catch (err) {
        console.error(`[Batch Job] Critical error:`, err);
      } finally {
        isJobRunning = false;
      }
    }
  }, 5000); // Check every 5 seconds if it's time to run
}

startServer();
