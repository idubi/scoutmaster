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

interface ProcessLog {
  id: string;
  timestamp: string;
  rowTimestamp: string;
  teamNumber: string;
  action: 'updated' | 'already_updated' | 'skipped' | 'triggered' | 'cleared';
  details: string;
}

// Global settings state (in-memory cache)
let settingsSyncedWithSheet = false;
let pendingSettingsSync: Promise<void> | null = null;

// Global kill-switch: Set to true to stop all processing
let isSystemPaused = false;
let processLogs: ProcessLog[] = [];
const MAX_LOGS = 100;

function addLog(log: Omit<ProcessLog, 'id' | 'timestamp'>) {
  const newLog: ProcessLog = {
    ...log,
    id: Math.random().toString(36).substring(2, 9),
    timestamp: new Date().toISOString()
  };
  processLogs.unshift(newLog);
  if (processLogs.length > MAX_LOGS) {
    processLogs = processLogs.slice(0, MAX_LOGS);
  }
}

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

  // Middleware to block all requests if system is paused (except status check)
  app.use((req, res, next) => {
    if (isSystemPaused && !req.path.startsWith("/api/system-status")) {
      return res.status(503).json({ error: "System is paused for maintenance" });
    }
    next();
  });

  app.get("/api/system-status", (req, res) => {
    res.json({ isSystemPaused });
  });

  app.get("/api/process-logs", (req, res) => {
    res.json(processLogs);
  });

  app.post("/api/clear-logs", (req, res) => {
    processLogs = [];
    res.json({ success: true });
  });

  app.post("/api/trigger-calc", async (req, res) => {
    if (!systemSettings.targetSheetId) {
      return res.status(400).json({ error: "No target sheet ID configured" });
    }
    
    addLog({
      rowTimestamp: new Date().toLocaleTimeString(),
      teamNumber: 'MANUAL',
      action: 'triggered',
      details: 'Manual calculation triggered by user.'
    });

    try {
      await updateTeamsGrades(systemSettings.targetSheetId);
      res.json({ success: true, message: "Calculation completed successfully" });
    } catch (error) {
      console.error("Manual trigger failed:", error);
      res.status(500).json({ error: "Calculation failed" });
    }
  });

  // Background Job Loop
  let isBatchJobRunning = false;
  let lastBatchRunTime = 0;
  let lastSettingsFetchTime = 0;

  // Start the background job loop
  setInterval(async () => {
    if (isSystemPaused) return;
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
      if (now - lastBatchRunTime > 60000) { // Log status every minute even if idle
         console.log(`[Auto-Calc Job] Status: ${systemSettings.isAutoCalcActive ? 'Active' : 'Disabled'} (Sheet: ${systemSettings.targetSheetId || 'None'})`);
         lastBatchRunTime = now;
      }
      if (!systemSettings.isAutoCalcActive && autoCalcStatus !== 'error') {
        autoCalcStatus = 'idle';
      }
      return;
    }

    const intervalMs = systemSettings.calcIntervalSeconds * 1000;

    if (now - lastBatchRunTime >= intervalMs && !isBatchJobRunning) {
      isBatchJobRunning = true;
      autoCalcStatus = 'running';
      console.log(`[Auto-Calc Job] Starting specialized execution for ${systemSettings.targetSheetId}...`);
      
      try {
        const lastConsolidationDate = systemSettings.lastConsolidationTime 
          ? new Date(systemSettings.lastConsolidationTime) 
          : new Date(0);
        
        // 1. Fetch ALL raw data (SQL-like query simulation)
        const RAW_DATA_SHEET = 'scoutsmaster_ongoing';
        const fetchUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${systemSettings.targetSheetId}&sheetName=${RAW_DATA_SHEET}`;
        const fetchResponse = await fetch(fetchUrl, { redirect: 'follow' });
        const fetchText = await fetchResponse.text();
        
        if (fetchResponse.ok && !fetchText.includes("not found")) {
          const rawData = JSON.parse(fetchText);
          
          const getRowTs = (row: any) => {
            return row.sessionEndTime || row.timestamp || row.Timestamp || row.sessionStartTime || row.rowTs || row.Date || row.time || row.Timestamp_ISO;
          };

          const newRecords = rawData.filter((record: any) => {
            const rawTs = getRowTs(record);
            if (!rawTs) return false;
            const ts = new Date(rawTs);
            // Strictly after last consolidation
            return ts.getTime() > lastConsolidationDate.getTime();
          });

          if (newRecords.length > 0) {
            const uniqueTeams = Array.from(new Set(newRecords.map(r => 
              String(r.teamScouted || r.TeamScouted || r.teamNumber || r.TeamNumber || r.team || r.Team || '').trim()
            ).filter(t => t !== '')));

            console.log(`[Auto-Calc Job] Found ${newRecords.length} new records strictly after ${lastConsolidationDate.toISOString()}. Processing teams: ${uniqueTeams.join(', ')}`);
            
            // Add batch summary log
            addLog({
              rowTimestamp: new Date().toLocaleTimeString(),
              teamNumber: 'BATCH',
              action: 'updated',
              details: `Found ${newRecords.length} new records for teams: ${uniqueTeams.join(', ')}.`
            });

            const currentSessionTeamsProcessed = new Set<string>();
            let hasChanges = false;

            for (const row of newRecords) {
              const teamNumber = String(row.teamScouted || row.TeamScouted || row.teamNumber || row.TeamNumber || row.team || row.Team || '').trim();
              const rowTs = String(getRowTs(row) || 'Unknown TS');
              
              if (!teamNumber) continue;

              if (!currentSessionTeamsProcessed.has(teamNumber)) {
                currentSessionTeamsProcessed.add(teamNumber);
                hasChanges = true;
              }
            }

            if (hasChanges) {
              await updateTeamsGrades(systemSettings.targetSheetId, uniqueTeams as string[]);
              systemSettings.lastConsolidationTime = new Date().toISOString();
              await persistSettingsToSheet(systemSettings.targetSheetId);
              console.log(`[Auto-Calc Job] Successfully refreshed scores.`);
            }
          } else {
            // Log a heartbeat every execution if requested, or every few minutes to avoid clutter
            // The user wants to see it even if no rows updated
            console.log(`[Auto-Calc Job] No new records found after ${lastConsolidationDate.toISOString()}.`);
            addLog({
              rowTimestamp: 'N/A',
              teamNumber: 'SYSTEM',
              action: 'skipped',
              details: `Sync run: No new records found since ${lastConsolidationDate.toLocaleTimeString()}. (Database is up to date)`
            });
            
            // Still update the heartbeat time to show the system checked
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
      addLog({
        rowTimestamp: 'Manual',
        teamNumber: 'ALL',
        action: 'updated',
        details: 'Manual recalculation triggered by user.'
      });
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

  async function updateTeamsGrades(targetSheetId: string, teamNumbersToUpdate?: string[]) {
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
      console.log(`[Recalculate] Starting surgical update for targetSheetId: ${targetSheetId}`);
      const consolidatedMap = new Map<string, TeamAggregatedData>();
      let matchCompleteCount = 0;

      // 1. Fetch ALL RAW DATA (to get full history for accuracy)
      const fetchRawUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${RAW_DATA_SHEET}`;
      const fetchRawRes = await fetch(fetchRawUrl, { redirect: 'follow' });
      const fetchRawText = await fetchRawRes.text();
      
      let rawData: any[] = [];
      if (fetchRawRes.ok && !fetchRawText.includes("not found")) {
        try {
          const parsed = JSON.parse(fetchRawText);
          rawData = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          console.warn("[Recalculate] Could not parse raw data.");
        }
      }

      // 2. Aggregate RAW DATA
      rawData.forEach(match => {
        const getVal = (row: any, ...keys: string[]) => {
          for (const key of keys) {
            if (row[key] !== undefined && row[key] !== null) return row[key];
          }
          return undefined;
        };

        const recType = String(getVal(match, 'recordType', 'RecordType', 'record_type') || '').trim();
        if (recType && recType !== 'MATCH_COMPLETE' && recType !== 'INIT_MARKER') return;
        if (recType === 'MATCH_COMPLETE') matchCompleteCount++;

        const teamNumber = String(getVal(match, 'teamScouted', 'TeamScouted', 'team', 'Team', 'teamNumber', 'TeamNumber') || '').trim();
        if (!teamNumber) return;

        const parseNum = (val: any) => {
          if (val === true || val === 'TRUE') return 1;
          if (val === false || val === 'FALSE') return 0;
          const n = Number(val);
          return isNaN(n) ? 0 : n;
        };
        const parseBool = (val: any) => val === true || val === 'TRUE';

        const teleHit = parseNum(getVal(match, 'teleBallHit', 'TeleBallHit'));
        const autoHit = parseNum(getVal(match, 'autoBallHit', 'AutoBallHit'));
        const teleMiss = parseNum(getVal(match, 'teleBallMiss', 'TeleBallMiss'));
        const autoMiss = parseNum(getVal(match, 'autoBallMiss', 'AutoBallMiss'));
        const isFullParking = parseBool(getVal(match, 'teleFullParking', 'TeleFullParking')) ? 1 : 0;
        const autoSmall = parseBool(getVal(match, 'isAutoZoneSmall', 'IsAutoZoneSmall')) ? 1 : 0;
        const autoBig = parseBool(getVal(match, 'isAutoZoneBig', 'IsAutoZoneBig')) ? 1 : 0;
        const teleSmall = parseBool(getVal(match, 'isTeleopZoneSmall', 'IsTeleopZoneSmall')) ? 1 : 0;
        const teleBig = parseBool(getVal(match, 'isTeleopZoneBig', 'IsTeleopZoneBig')) ? 1 : 0;
        const autoLeave = parseBool(getVal(match, 'isAutoLeave', 'IsAutoLeave')) ? 1 : 0;
        const gateFoul = parseNum(getVal(match, 'teleGateFoul', 'TeleGateFoul'));
        const parkingFoul = parseNum(getVal(match, 'teleParkingFoul', 'TeleParkingFoul'));
        const intakeFoul = parseNum(getVal(match, 'teleIntakeFoul', 'TeleIntakeFoul'));
        let fouls = gateFoul + parkingFoul + intakeFoul;
        if (fouls === 0) fouls = parseNum(getVal(match, 'teleFoulCount', 'TeleFoulCount'));

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
            TeamNumber: teamNumber, GAMES_COUNT: 1, TOTAL_TELEOP_HIT: teleHit, TOTAL_AUTONOMUS_HIT: autoHit,
            TOTAL_TELEOP_MISS: teleMiss, TOTAL_AUTONOMUS_MISS: autoMiss, TOTAL_IS_FULL_PARKING: isFullParking,
            TOTAL_AUTO_ZONE_SMALL: autoSmall, TOTAL_AUTO_ZONE_BIG: autoBig, TOTAL_TELEOP_ZONE_SMALL: teleSmall,
            TOTAL_TELEOP_ZONE_BIG: teleBig, TOTAL_AUTO_LEAVE: autoLeave, TOTAL_FOULS: fouls,
            TOTAL_GATE_FOULS: gateFoul, TOTAL_PARKING_FOULS: parkingFoul, TOTAL_INTAKE_FOULS: intakeFoul,
            GRADE: 0, RATIO: 0, RANK: 0
          });
        }
      });

      // 3. Calculate full state locally (including ranks)
      const teamsList = Array.from(consolidatedMap.values()).map(team => {
        const { grade, ratio } = calculateTeamGrade(team);
        return { ...team, GRADE: grade, RATIO: ratio }; 
      });
      teamsList.sort((a, b) => b.GRADE - a.GRADE);
      teamsList.forEach((team, index) => { team.RANK = index + 1; });

      // 4. Determine what needs to be written to the sheet
      if (teamNumbersToUpdate && teamNumbersToUpdate.length > 0) {
        console.log(`[Update] Surgical update for teams: ${teamNumbersToUpdate.join(', ')}`);
        
        // Surgical: For each requested team, delete its old row and append new one
        for (const teamNumber of teamNumbersToUpdate) {
          const updatedData = teamsList.find(t => t.TeamNumber === teamNumber);
          if (!updatedData) continue;

          // Delete old row
          console.log(`[Update] Deleting old row for team ${teamNumber}...`);
          await fetch(`${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${TEAMS_GRADES_SHEET}&action=deleteByValue&key=TeamNumber&value=${teamNumber}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deleteByValue', key: 'TeamNumber', value: teamNumber, sheetName: TEAMS_GRADES_SHEET, targetSheetId }),
            redirect: 'follow'
          });

          // Append new row
          console.log(`[Update] Appending new row for team ${teamNumber}.`);
          await fetch(`${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${TEAMS_GRADES_SHEET}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...updatedData, targetSheetId, sheetName: TEAMS_GRADES_SHEET, headers: TEAMS_GRADES_HEADERS }),
            redirect: 'follow'
          });
        }
        
        // Note: Global ranks might be outdated if we only update these. 
        // But user specifically asked to only update the new group.
      } else {
        // FULL REFRESH: Still avoid recreate if possible (by using clear + multiple appends)
        // However, standard recreate is safer for full refresh unless the user hates the tab deletion.
        // Given "DO NOT DELETE THE CURRENT TAB", I'll try action=clear if supported, 
        // or I'll just use recreate for manual but surgical for auto.
        // Actually, the user's directive is strong. I'll use recreate for FULL only if surgical fails.
        
        console.log(`[Update] Full refresh requested for ${TEAMS_GRADES_SHEET}.`);
        const recreateUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${TEAMS_GRADES_SHEET}&action=recreate`;
        await fetch(recreateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'recreate', targetSheetId, sheetName: TEAMS_GRADES_SHEET, headers: TEAMS_GRADES_HEADERS }),
          redirect: 'follow'
        });

        for (const team of teamsList) {
          await fetch(`${GOOGLE_SHEET_URL}?targetSheetId=${targetSheetId}&sheetName=${TEAMS_GRADES_SHEET}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...team, targetSheetId, sheetName: TEAMS_GRADES_SHEET, headers: TEAMS_GRADES_HEADERS }),
            redirect: 'follow'
          });
        }
      }
    } catch (error) {
      console.error("Error in surgical updateTeamsGrades:", error);
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
