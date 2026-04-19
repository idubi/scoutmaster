import {ENV}  from "./constants";




async function run() {
  const SPREADSHEET_ID = '1AF7CpExwwMI2xDWMYxVkLq0UNls_VPEtwXUQkOMl9i8';
  const RAW_DATA_SHEET = 'scoutsmaster_ongoing';
  const GOOGLE_SHEET_URL = ENV.GOOGLE_SHEET_URL;
  
  const fetchUrl = `${GOOGLE_SHEET_URL}?targetSheetId=${SPREADSHEET_ID}&sheetName=${RAW_DATA_SHEET}`;
  const fetchResponse = await fetch(fetchUrl, { redirect: 'follow' });
  const fetchText = await fetchResponse.text();
  
  let rawData = [];
  try {
    const parsed = JSON.parse(fetchText);
    rawData = Array.isArray(parsed) ? parsed : (parsed.data ? parsed.data : []);
  } catch (e) {
    console.error("Parse error", e);
    return;
  }
  
  console.log("Raw data length:", rawData.length);
  if (rawData.length > 0) {
    console.log("Sample raw record:", JSON.stringify(rawData[0], null, 2));
  }
  
  const consolidatedMap = new Map();
  
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

    const gateFoul = Number(match.teleGateFoul || 0);
    const parkingFoul = Number(match.teleParkingFoul || 0);
    const intakeFoul = Number(match.teleIntakeFoul || 0);
    let fouls = gateFoul + parkingFoul + intakeFoul;
    if (fouls === 0 && match.teleFoulCount) {
      fouls = Number(match.teleFoulCount);
    }

    if (consolidatedMap.has(teamNumber)) {
      const existing = consolidatedMap.get(teamNumber);
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
  
  console.log("Consolidated:", Array.from(consolidatedMap.values()));
}
run();
