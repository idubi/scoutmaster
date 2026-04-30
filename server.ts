import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import fetch from "node-fetch";
import path from "path";
import { calculateTeamGrade } from "./lib/gradingEngine.ts";
import type { TeamAggregatedData } from "./types.ts";
import {ENV}  from "./constants.ts";


const GOOGLE_SHEET_URL = ENV.GOOGLE_SHEET_URL;

interface SystemSettings {
  isAutoCalcActive: boolean;
  calcIntervalSeconds: number;
  targetSheetId: string;
  lastConsolidationTime: string | null;
}

// Global settings state (in-memory cache)
let settingsSyncedWithSheet = false;
let pendingSettingsSync: Promise<void> | null = null;

let systemSettings: SystemSettings = {
  isAutoCalcActive: false,
  calcIntervalSeconds: 80,
  targetSheetId: ENV.SPREADSHEET_ID as string,
  lastConsolidationTime: null
};

// Tracking internal state for the auto-calc job
let autoCalcStatus: 'idle' | 'running' | 'error' = 'idle';
let consecutiveFailures = 0;
const MAX_FAILURES = 5;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Background Job Loop
  let isBatchJobRunning = false;
  let lastBatchRunTime = 0;
  let lastSettingsFetchTime = 0;

  // Start the background job loop
  setInterval(async () => {
    const now = Date.now();
    
    // 1. Periodically fetch settings from Excel independently (every 2.5 minutes)
    if (systemSettings.targetSheetId && (now - lastSettingsFetchTime > 150000)) {
      refreshSettingsFromSheet(systemSettings.targetSheetId).catch(err => 
        console.error("[Settings Background] Sync failed:", err)
      );
      lastSettingsFetchTime = now;
    }

    // 2. Periodic Auto-Calculation
    if (!systemSettings.isAutoCalcActive || !systemSettings.targetSheetId) {
      if (!systemSettings.isAutoCalcActive && autoCalcStatus !== 'error') {
        autoCalcStatus = 'idle';
      }
      return;
    }

    const intervalMs = systemSettings.calcIntervalSeconds * 1000;

    if (now - lastBatchRunTime >= intervalMs && !isBatchJobRunning) {
      isBatchJobRunning = true;
      autoCalcStatus = 'running';
      console.log(`[Batch Job] Starting scheduled execution for ${systemSettings.targetSheetId}...`);
      
      try {
        const lastConsolidationDate = systemSettings.lastConsolidationTime ? new Date(systemSettings.lastConsolidationTime) : new Date(0);
        
        // Fetch raw data
        const RAW_DATA_SHEET = 'scoutsmaster_ongoing';
        const fetchUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${systemSettings.targetSheetId}&sheetName=${RAW_DATA_SHEET}`;
        const fetchResponse = await fetch(fetchUrl, { redirect: 'follow' });
        const fetchText = await fetchResponse.text();
        
        if (fetchResponse.ok && !fetchText.includes("not found")) {
          const rawData = JSON.parse(fetchText);
          
          let hasNewGames = false;
          for (const game of rawData) {
             const ts = new Date(game.Timestamp || game.timestamp);
             if (ts > lastConsolidationDate) {
               hasNewGames = true;
               break;
             }
          }

          if (hasNewGames) {
            console.log(`[Batch Job] Found new games. Performing consolidation...`);
            await updateTeamsGrades(systemSettings.targetSheetId);
            systemSettings.lastConsolidationTime = new Date().toISOString();
            await persistSettingsToSheet(systemSettings.targetSheetId);
          } else {
            console.log(`[Batch Job] No new games since ${lastConsolidationDate.toLocaleString()}.`);
            // We still update the time to show the heartbeat, but maybe less frequently to save on API calls
            // For now, satisfy user request to always update execution time
            systemSettings.lastConsolidationTime = new Date().toISOString();
            await persistSettingsToSheet(systemSettings.targetSheetId);
          }
        }
        
        lastBatchRunTime = Date.now();
        consecutiveFailures = 0; 
        autoCalcStatus = 'idle';
      } catch (err) {
        console.error(`[Batch Job] Error:`, err);
        consecutiveFailures++;
        autoCalcStatus = 'error';
        if (consecutiveFailures >= MAX_FAILURES) {
          systemSettings.isAutoCalcActive = false;
          await persistSettingsToSheet(systemSettings.targetSheetId);
        }
      } finally {
        isBatchJobRunning = false;
      }
    }
  }, 10000); // Pulse every 10 seconds

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

      if (text.includes("Original sheet not found")) {
        return res.status(404).json({ 
          error: "Sheet not found",
          message: `The sheet "${sheetName}" was not found in the spreadsheet.`
        });
      }

      if (response.ok) {
        if (text.includes("Der Bereich muss mindestens 1 Spalte enthalten") || 
            text.includes("The range must contain at least one column") ||
            text.trim() === "[]" || text.trim() === "") {
          console.warn("Proxy: Sheet is empty or missing headers. Returning empty array.");
          return res.json([]);
        }
        try {
          const data = JSON.parse(text);
          res.json(data);
        } catch (parseError) {
          console.error("Proxy: Received non-JSON response from Google.");
          console.error("DEBUG: Response body starts with:", text.substring(0, 500));
          console.error("DEBUG: Try opening this URL in your browser to see the error:");
          console.error(url);
          res.status(500).json({ 
            error: "Google Script returned an error page instead of data.",
            url: url,
            details: text.substring(0, 200)
          });
        }
      } else {
        console.error(`Proxy: Google Script returned error status ${response.status}`);
        res.status(response.status).json({ error: "Google Script returned an error status." });
      }
    } catch (error) {
      console.error("Proxy fetch error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // API Proxy for syncing data
  app.post("/api/sync", async (req, res) => {
    const { targetSheetId, sheetName, recordType, action } = req.body;
    
    if (!targetSheetId) {
      return res.status(400).json({ error: "Missing targetSheetId" });
    }

    console.log(`Proxy: SYNC START - Spreadsheet: ${targetSheetId}, Sheet: ${sheetName}, Action: ${action || 'default'}`);
    
    try {
      // We send sheetName in BOTH the URL and the JSON body to be 100% sure Google sees it
      let url = `${GOOGLE_SHEET_URL}?targetSheetId=${encodeURIComponent(targetSheetId)}&sheetName=${encodeURIComponent(sheetName || '')}`;
      if (action) url += `&action=${encodeURIComponent(action)}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
        redirect: 'follow'
      });
      
      const responseText = await response.text();
      console.log(`Proxy: Google Response (first 100 chars): ${responseText.substring(0, 100)}`);
      
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

  // Helper to persist settings to Google Sheets
  async function persistSettingsToSheet(targetId: string) {
    if (!targetId) return;
    try {
      const SETTINGS_SHEET = 'SYSTEM_SETTINGS';
      const SETTINGS_HEADERS = ['isAutoCalcActive', 'calcIntervalSeconds', 'targetSheetId', 'lastConsolidationTime'];
      
      // Use the recreate logic to always have a clean settings row
      const url = `${GOOGLE_SHEET_URL}?targetSheetId=${encodeURIComponent(targetId)}&sheetName=${encodeURIComponent(SETTINGS_SHEET)}&action=recreate`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'recreate', 
          targetSheetId: targetId, 
          sheetName: SETTINGS_SHEET,
          headers: SETTINGS_HEADERS
        }),
        redirect: 'follow'
      });

      // Append the single row of settings
      await fetch(`${GOOGLE_SHEET_URL}?targetSheetId=${encodeURIComponent(targetId)}&sheetName=${encodeURIComponent(SETTINGS_SHEET)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isAutoCalcActive: String(systemSettings.isAutoCalcActive),
          calcIntervalSeconds: String(systemSettings.calcIntervalSeconds),
          targetSheetId: targetId,
          lastConsolidationTime: systemSettings.lastConsolidationTime || "",
          sheetName: SETTINGS_SHEET,
          headers: SETTINGS_HEADERS
        }),
        redirect: 'follow'
      });
      console.log(`[Settings] Persisted to ${targetId}: LastCons=${systemSettings.lastConsolidationTime}`);
    } catch (err) {
      console.error("[Settings] Failed to persist to Google Sheets:", err);
    }
  }

  app.post("/api/recalculate", async (req, res) => {
    const { targetSheetId } = req.body;
    try {
      await updateTeamsGrades(targetSheetId);
      
      // Update local time and PERSIST to DB
      systemSettings.lastConsolidationTime = new Date().toISOString();
      await persistSettingsToSheet(targetSheetId);
      
      res.json({ status: "success", message: "Grades recalculated and consolidated", lastConsolidationTime: systemSettings.lastConsolidationTime });
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
    const { targetSheetId } = req.query;
    
    // Non-blocking sync trigger: only start if not already synced and no sync is in progress
    if (targetSheetId && !settingsSyncedWithSheet && !pendingSettingsSync) {
      const targetIdStr = String(targetSheetId);
      console.log(`[Settings] First-time load sync triggered for: ${targetIdStr}`);
      refreshSettingsFromSheet(targetIdStr).catch(console.error);
    }

    res.json({
      ...systemSettings,
      autoCalcStatus,
      consecutiveFailures
    });
  });

  // API to update system settings
  app.post("/api/settings", async (req, res) => {
    const { isAutoCalcActive, targetSheetId, lastConsolidationTime } = req.body;
    
    // Update local cache
    systemSettings = {
      ...systemSettings,
      isAutoCalcActive: isAutoCalcActive === undefined ? systemSettings.isAutoCalcActive : !!isAutoCalcActive,
      targetSheetId: targetSheetId || systemSettings.targetSheetId,
      lastConsolidationTime: lastConsolidationTime === undefined ? systemSettings.lastConsolidationTime : lastConsolidationTime
    };

    console.log(`[Settings] Updated by Client. Active=${systemSettings.isAutoCalcActive}, Time=${systemSettings.lastConsolidationTime}`);
    
    if (systemSettings.targetSheetId) {
      await persistSettingsToSheet(systemSettings.targetSheetId);
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
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (systemSettings.targetSheetId) {
      refreshSettingsFromSheet(systemSettings.targetSheetId).catch(err => 
        console.error("[Settings] Initial fetch failed:", err)
      );
    }
  });

  async function refreshSettingsFromSheet(targetId: string) {
    if (!targetId) return;
    if (pendingSettingsSync) return pendingSettingsSync;

    console.log(`[Settings] Sync process started for ${targetId}`);
    
    pendingSettingsSync = (async () => {
      try {
        const SETTINGS_SHEET = 'SYSTEM_SETTINGS';
        const url = `${GOOGLE_SHEET_URL}?targetSheetId=${encodeURIComponent(targetId)}&sheetName=${encodeURIComponent(SETTINGS_SHEET)}`;
        const response = await fetch(url, { redirect: 'follow' });
        
        if (response.ok) {
          const text = await response.text();
          if (!text.includes("not found") && text.trim() !== "" && !text.includes("<!DOCTYPE html>")) {
            try {
              const data = JSON.parse(text);
              if (Array.isArray(data) && data.length > 0) {
                const latest = data[0];
                systemSettings = {
                  ...systemSettings,
                  isAutoCalcActive: latest.isAutoCalcActive === true || latest.isAutoCalcActive === 'TRUE',
                  calcIntervalSeconds: Number(latest.calcIntervalSeconds) || 80,
                  targetSheetId: String(targetId),
                  lastConsolidationTime: latest.lastConsolidationTime || null
                };
                settingsSyncedWithSheet = true;
                console.log(`[Settings] Successfully synced from sheet. Interval: ${systemSettings.calcIntervalSeconds}s, Auto-Calc: ${systemSettings.isAutoCalcActive}`);
              }
            } catch (e) {
              console.warn("[Settings] Refresh: data malformed.");
            }
          }
        }
      } catch (err) {
        console.error("[Settings] Refresh failed:", err);
      } finally {
        pendingSettingsSync = null;
      }
    })();

    return pendingSettingsSync;
  }

}

startServer();
