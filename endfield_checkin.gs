
// ========================================================================================
// Project: Arknights: Endfield Auto Check-in Script (v1.3 - Auto Detect )
// Author: nattapat2871
// Github: https://github.com/Nattapat2871/endfield-sign/endfield_checkin.gs
// ========================================================================================


// =========================================================
// 👇 ACCOUNT SETTINGS
// =========================================================
const ACCOUNT_LIST = [
  {
    "name": "Main Account",
    "token": ""  // enter your ACCOUNT_TOKEN here
  },
  // add more account
  // {
  //   "name": "Sub Account",
  //   "token": "..."
  // }
];

const DISCORD_WEBHOOK_URL = "YOUR_DISCORD_WEBHOOK_URL_HERE"; 

// =========================================================













/** this script made by Nattapat2871    **/
/** After this line is the script code. Please DO NOT modify. **/
/** This script is .gs and works only in Google app script.  (https://script.google.com)  */


const APP_CODE = "6eb76d4e13aa36e6";
const BASE_URL = "https://zonai.skport.com";
const USER_AGENT = "Skport/0.7.0 (com.gryphline.skport; build:700089; Android 33; ) Okhttp/5.1.0";


// =========================================================
// 🚀 MAIN FUNCTION (ผู้สั่งงานหลัก)
// =========================================================
function runFullProcess() {
  if (ACCOUNT_LIST.length === 0) {
    Logger.log("❌ Error: Missing ACCOUNT_LIST.");
    return;
  }

  Logger.log(`🚀 Starting check-in for ${ACCOUNT_LIST.length} accounts...`);

  // Loop 1: วนลูปทีละ Account (Token)
  for (let i = 0; i < ACCOUNT_LIST.length; i++) {
    const account = ACCOUNT_LIST[i];
    Logger.log(`\n--- 🔑 Processing Account: ${account.name} ---`);

    try {
      // 1. Authenticate (เข้าสู่ระบบ)
      const authData = step1_Authenticate(account);
      
      // 1.5 Auto-Detect Roles (หาตัวละครทั้งหมดเอง)
      const targetRoles = step1_5_FetchGameRoles(authData);
      
      Logger.log(`   🔍 Found ${targetRoles.length} role(s) for this account.`);

      if (targetRoles.length === 0) {
        Logger.log("   ⚠️ No game roles found (Check if you have created a character). Skipping...");
        continue;
      }

      // Loop 2: วนลูปทีละตัวละคร (รองรับ Asia + USA + others)
      for (let j = 0; j < targetRoles.length; j++) {
        const currentRoleId = targetRoles[j]; // Format: "3_UID_Server"
        
        try {
          // 2. Get Profile (ดึงข้อมูลตัวละครเพื่อความสวยงามใน Log/Discord)
          const profile = step2_GetUserProfile(authData, currentRoleId);
          Logger.log(`   🎮 Checking for: ${profile.username} (UID: ${profile.uid})`);

          // 3. Check-in (เช็คชื่อและรับของ)
          const result = step3_ProcessCheckIn(authData, currentRoleId);
          
          Logger.log(`      ✅ Result: ${result.message} | Reward: ${result.rewardName} x${result.rewardCount}`);

          // 4. Notify Discord (ส่งแจ้งเตือน)
          step4_SendDiscord(account, profile, result);

        } catch (innerErr) {
          Logger.log(`      ❌ Error on Role ${currentRoleId}: ${innerErr.message}`);
           step4_SendDiscord(account, { username: "Unknown Role", uid: currentRoleId, avatarUrl: "" }, { 
            success: false, 
            message: innerErr.message, 
            rewardName: "Error", 
            rewardCount: 0 
          }, true);
        }

        // หน่วงเวลา 1 วินาทีระหว่างตัวละครในไอดีเดียวกัน
        if (j < targetRoles.length - 1) Utilities.sleep(1000);
      }

    } catch (e) {
      Logger.log(`❌ Critical Error for Account ${account.name}: ${e.message}`);
      // ส่งแจ้งเตือน Error ระดับ Account (เช่น Token ตาย)
      step4_SendDiscord(account, { username: "System", uid: "Auth Failed", avatarUrl: "" }, { 
        success: false, 
        message: e.message, 
        rewardName: "Error", 
        rewardCount: 0 
      }, true);
    }

    // หน่วงเวลา 2 วินาทีก่อนทำ Account ถัดไป
    if (i < ACCOUNT_LIST.length - 1) Utilities.sleep(2000);
  }
}

// =========================================================
// 🛠️ STEP FUNCTIONS (ฟังก์ชันย่อยตามลำดับ)
// =========================================================

// ขั้นตอนที่ 1: จัดการเรื่อง Token และ Credential
function step1_Authenticate(account) {
  try {
    const authData = performOauthFlow(account.token); 
    return authData; // { cred, salt }
  } catch (e) {
    throw new Error("Authentication Failed (Check Token): " + e.message);
  }
}

// ขั้นตอนที่ 1.5: ค้นหา Role ID ทั้งหมด (Auto-Detect)
function step1_5_FetchGameRoles(authData) {
  const ts = getTimestamp();
  const path = "/api/v1/game/player/binding";
  const headers = getHeaders(path, ts, authData.cred, authData.salt, "");

  try {
    const res = UrlFetchApp.fetch(BASE_URL + path, { method: "get", headers: headers, muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());

    const foundRoles = [];
    if (json.code === 0 && json.data && json.data.list) {
      const appList = json.data.list;
      // วนหา appCode = endfield
      for (let app of appList) {
        if (app.appCode === "endfield" && app.bindingList) {
          // วนทุก Binding
          for (let binding of app.bindingList) {
             // สูตรการสร้าง Role String คือ: "3_UID_ServerID" (3 คือ Game ID ของ Endfield)
             
             // 1. เช็ค defaultRole
             if (binding.defaultRole) {
                const r = binding.defaultRole;
                foundRoles.push(`3_${r.roleId}_${r.serverId}`);
             }
             
             // 2. เช็ค roles อื่นๆ
             if (binding.roles && binding.roles.length > 0) {
               for (let r of binding.roles) {
                 const fullId = `3_${r.roleId}_${r.serverId}`;
                 if (!foundRoles.includes(fullId)) {
                   foundRoles.push(fullId);
                 }
               }
             }
          }
        }
      }
    }
    return foundRoles; 
  } catch (e) {
    Logger.log("⚠️ Warning: Failed to fetch game roles auto-binding. " + e.message);
    return [];
  }
}

// ขั้นตอนที่ 2: ดึงข้อมูลโปรไฟล์
function step2_GetUserProfile(authData, roleId) {
  const ts = getTimestamp();
  const path = "/web/v2/user";
  const headers = getHeaders(path, ts, authData.cred, authData.salt, roleId);

  try {
    const res = UrlFetchApp.fetch(BASE_URL + path, { method: "get", headers: headers, muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());

    if (json.code === 0 && json.data && json.data.user) {
      const basicUser = json.data.user.basicUser;
      return {
        username: basicUser.nickname || "Unknown",
        uid: basicUser.id || roleId,
        avatarUrl: basicUser.avatar || ""
      };
    }
  } catch (e) {
    Logger.log("⚠️ Warning: Could not fetch profile.");
  }
  
  return { username: "Unknown User", uid: roleId, avatarUrl: "" };
}

// ขั้นตอนที่ 3: เช็คชื่อประจำวัน
function step3_ProcessCheckIn(authData, roleId) {
  const path = "/web/v1/game/endfield/attendance";
  const url = BASE_URL + path;
  
  // 3.1 ดึงปฏิทินดูสถานะก่อน
  let ts = getTimestamp();
  let headers = getHeaders(path, ts, authData.cred, authData.salt, roleId);
  
  const statusRes = UrlFetchApp.fetch(url, { method: "get", headers: headers, muteHttpExceptions: true });
  const statusData = JSON.parse(statusRes.getContentText());

  if (statusData.code !== 0) {
    throw new Error("Calendar Fetch Failed: " + (statusData.message || statusData.code));
  }

  const data = statusData.data || {};
  const calendar = data.calendar || [];
  const resMap = data.resourceInfoMap || {};
  const totalDays = calendar.length;
  let claimedCount = calendar.filter(day => day.done).length;
  let isSuccess = false;
  let message = "";
  let rewardIdx = -1;

  // 3.2 ตัดสินใจว่าจะกดรับหรือไม่
  if (data.hasToday) {
    message = "✅ Already signed in today.";
    isSuccess = true;
    rewardIdx = claimedCount > 0 ? claimedCount - 1 : 0;
  } else {
    // ต้องกดรับ (POST)
    ts = getTimestamp(); 
    headers = getHeaders(path, ts, authData.cred, authData.salt, roleId); 
    
    const postRes = UrlFetchApp.fetch(url, { method: "post", headers: headers, muteHttpExceptions: true });
    const postData = JSON.parse(postRes.getContentText());

    if (postData.code === 0) {
      message = "🎉 Success! Reward claimed.";
      isSuccess = true;
      rewardIdx = claimedCount; 
      claimedCount++;
    } else {
      message = "❌ Claim Failed: " + postData.message;
      isSuccess = false;
    }
  }

  // 3.3 แกะข้อมูลของรางวัล
  let rewardName = "Unknown", rewardCount = 0, rewardIcon = "";
  if (rewardIdx >= 0 && rewardIdx < totalDays) {
    const awardId = calendar[rewardIdx].awardId;
    const info = resMap[awardId] || {};
    rewardName = info.name || awardId;
    rewardCount = info.count || 1;
    rewardIcon = info.icon || "";
  }

  return {
    success: isSuccess,
    message: message,
    claimedCount: claimedCount,
    totalDays: totalDays,
    rewardName: rewardName,
    rewardCount: rewardCount,
    rewardIcon: rewardIcon
  };
}

// ขั้นตอนที่ 4: ส่ง Discord
function step4_SendDiscord(account, profile, result, isError = false) {
  if (!DISCORD_WEBHOOK_URL || !DISCORD_WEBHOOK_URL.startsWith("http")) return;

  const color = isError ? 16711680 : (result.success ? 3066993 : 15548997); 
  
  const fields = [];
  if (!isError) {
    fields.push({ "name": "👤 Username", "value": `${profile.username} (UID: ${profile.uid})`, "inline": false });
    fields.push({ "name": "📅 Progress", "value": `${result.claimedCount} / ${result.totalDays} days`, "inline": true });
    fields.push({ "name": "🎁 Reward", "value": `${result.rewardName} x${result.rewardCount}`, "inline": true });
  } else {
    fields.push({ "name": "⚠️ Error Details", "value": result.message, "inline": false });
  }

  const payload = {
    "username": "Endfield Bot",
    "avatar_url": "https://static.skport.com/image/common/20251031/46750c47729f845b4db6c404e12f771c.png",
    "embeds": [{
      "author": { "name": account.name, "icon_url": profile.avatarUrl },
      "title": isError ? "Check-in Error" : "Arknights: Endfield Check-in",
      "description": result.message,
      "color": color,
      "fields": fields,
      "thumbnail": { "url": result.rewardIcon || "" },
      "timestamp": new Date().toISOString(),
      "footer": { "text": "Skport Auto Check-in" }
    }]
  };

  try {
    UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log("⚠️ Failed to send Discord webhook.");
  }
}

// =========================================================
// 🔧 HELPER FUNCTIONS (ระบบหลังบ้าน)
// =========================================================

function getTimestamp() {
  return Math.floor(Date.now() / 1000).toString();
}

function performOauthFlow(accountToken) {
  const encodedToken = encodeURIComponent(accountToken);
  
  // Step 1: Info
  const infoRes = UrlFetchApp.fetch(`https://as.gryphline.com/user/info/v1/basic?token=${encodedToken}`, { muteHttpExceptions: true });
  if (JSON.parse(infoRes.getContentText()).status !== 0) throw new Error("OAuth Info Failed");

  // Step 2: Grant
  const grantRes = UrlFetchApp.fetch("https://as.gryphline.com/user/oauth2/v2/grant", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ "token": accountToken, "appCode": APP_CODE, "type": 0 }),
    muteHttpExceptions: true
  });
  const grantData = JSON.parse(grantRes.getContentText());
  if (grantData.status !== 0) throw new Error("OAuth Grant Failed");

  // Step 3: Cred
  const credRes = UrlFetchApp.fetch(`${BASE_URL}/web/v1/user/auth/generate_cred_by_code`, {
    method: "post",
    headers: { "platform": "3", "content-type": "application/json" },
    payload: JSON.stringify({ "code": grantData.data.code, "kind": 1 }),
    muteHttpExceptions: true
  });
  const credData = JSON.parse(credRes.getContentText());
  if (credData.code !== 0) throw new Error("Generate Cred Failed");

  return { cred: credData.data.cred, salt: credData.data.token };
}

function getHeaders(path, timestamp, cred, salt, roleId) {
  const sign = generateSign(path, timestamp, salt);
  const headers = {
    "cred": cred,
    "platform": "3",
    "sk-language": "en",
    "timestamp": timestamp,
    "vname": "1.0.0",
    "sign": sign,
    "User-Agent": USER_AGENT,
    "content-type": "application/json"
  };
  
  if (roleId && roleId !== "") {
    headers["sk-game-role"] = roleId;
  }
  
  return headers;
}

function generateSign(path, timestamp, salt) {
  const headerDict = { "platform": "3", "timestamp": timestamp, "dId": "", "vName": "1.0.0" };
  const jsonStr = JSON.stringify(headerDict).replace(/\s/g, ""); 
  const s = path + timestamp + jsonStr;
  const hmacBytes = Utilities.computeHmacSha256Signature(s, salt);
  const hmacHex = bytesToHex(hmacBytes);
  const md5Bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, hmacHex);
  return bytesToHex(md5Bytes);
}

function bytesToHex(bytes) {
  return bytes.map(byte => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('');
}
