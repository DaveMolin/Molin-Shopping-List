/**
 * Molin Shopping List — Google Sheets backend
 *
 * Paste this whole file into Extensions > Apps Script of your Google Sheet.
 * 1. Change FAMILY_PASSCODE below to something your family will remember.
 * 2. Run the `setup` function once (it creates the Items, Saved and Updates tabs).
 * 3. Deploy > New deployment > Web app: Execute as "Me", Who has access "Anyone".
 * 4. Copy the Web app URL into the app's setup screen.
 */

const FAMILY_PASSCODE = "change-me";

const SHEETS = {
  Items:   ["id", "name", "brand", "qty", "store", "price", "addedBy", "claimedBy", "done", "doneBy", "reported", "createdAt"],
  Saved:   ["id", "name", "brand", "qty", "store", "price", "savedBy"],
  Updates: ["id", "by", "count", "missedCount", "items", "missed", "stores", "total", "at"],
};

// Store ids used by the app <-> names shown in the sheet.
const STORE_NAMES = {
  costco: "Costco", shoprite: "ShopRite", fooduniverse: "Food Universe",
  stopandshop: "Stop & Shop", amazon: "Amazon", other: "Other",
};
const LIST_SEP = " · ";
const DATE_FIELDS = { createdAt: true, at: true };
const BOOL_FIELDS = { done: true, reported: true };
const NUM_FIELDS = { qty: true, price: true, count: true, missedCount: true, total: true };
const LIST_FIELDS = { items: true, missed: true, stores: true };

/* ---------------- one-time setup ---------------- */

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = SHEETS[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  });
  const items = ss.getSheetByName("Items");
  items.getRange("I2:I").insertCheckboxes();
  items.getRange("K2:K").insertCheckboxes();
  items.getRange("F2:F").setNumberFormat("$0.00");
  items.getRange("L2:L").setNumberFormat("yyyy-mm-dd h:mm am/pm");
  ss.getSheetByName("Saved").getRange("F2:F").setNumberFormat("$0.00");
  ss.getSheetByName("Updates").getRange("H2:H").setNumberFormat("$0.00");
  ss.getSheetByName("Updates").getRange("I2:I").setNumberFormat("yyyy-mm-dd h:mm am/pm");
  const def = ss.getSheetByName("Sheet1");
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

/* ---------------- web app entry points ---------------- */

function doGet(e) {
  return handle_(function () {
    const p = (e && e.parameter) || {};
    checkKey_(p.key);
    if (p.action === "ping") return { ok: true };
    return { ok: true, items: readAll_("Items"), saved: readAll_("Saved"), updates: readAll_("Updates").sort(function (a, b) { return b.at - a.at; }).slice(0, 10) };
  });
}

function doPost(e) {
  return handle_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    checkKey_(body.key);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      switch (body.action) {
        case "addItem":      appendRow_("Items", clean_(body.item, SHEETS.Items)); break;
        case "updateItem":   updateRow_("Items", body.id, clean_(body.patch, SHEETS.Items)); break;
        case "deleteItem":   deleteRow_("Items", body.id); break;
        case "deleteItems":  (body.ids || []).forEach(function (id) { deleteRow_("Items", id); }); break;
        case "saveQuick":    upsertRow_("Saved", clean_(body.saved, SHEETS.Saved)); break;
        case "deleteQuick":  deleteRow_("Saved", body.id); break;
        case "completeTrip":
          appendRow_("Updates", clean_(body.update, SHEETS.Updates));
          (body.gotIds || []).forEach(function (id) { updateRow_("Items", id, { reported: true }); });
          (body.missedIds || []).forEach(function (id) { updateRow_("Items", id, { claimedBy: "" }); });
          break;
        default: throw new Error("Unknown action");
      }
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return { ok: true };
  });
}

/* ---------------- helpers ---------------- */

function handle_(fn) {
  let out;
  try { out = fn(); }
  catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function checkKey_(key) {
  if (String(key || "") !== String(FAMILY_PASSCODE)) throw new Error("Wrong passcode");
}

function sheet_(name) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) throw new Error("Missing tab " + name + ". Run setup first.");
  return sh;
}

function clean_(obj, headers) {
  const out = {};
  if (!obj) return out;
  headers.forEach(function (h) { if (Object.prototype.hasOwnProperty.call(obj, h)) out[h] = obj[h]; });
  return out;
}

function toCell_(field, v) {
  if (v === undefined || v === null) return "";
  if (field === "store") return STORE_NAMES[v] || STORE_NAMES.other;
  if (DATE_FIELDS[field]) return v ? new Date(Number(v)) : "";
  if (BOOL_FIELDS[field]) return !!v;
  if (NUM_FIELDS[field]) return Number(v) || 0;
  if (LIST_FIELDS[field]) return (v || []).map(String).join(LIST_SEP);
  return String(v).slice(0, 500);
}

function fromCell_(field, v) {
  if (field === "store") {
    const name = String(v || "").trim().toLowerCase();
    for (const id in STORE_NAMES) if (STORE_NAMES[id].toLowerCase() === name || id === name) return id;
    return "other";
  }
  if (DATE_FIELDS[field]) return v instanceof Date ? v.getTime() : (Number(v) || 0);
  if (BOOL_FIELDS[field]) return v === true || String(v).toUpperCase() === "TRUE";
  if (NUM_FIELDS[field]) return Number(v) || 0;
  if (LIST_FIELDS[field]) return v ? String(v).split(LIST_SEP).filter(String) : [];
  return v === null || v === undefined ? "" : String(v);
}

function readAll_(name) {
  const sh = sheet_(name);
  const headers = SHEETS[name];
  const last = sh.getLastRow();
  if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, headers.length).getValues();
  const out = [];
  rows.forEach(function (r) {
    if (!r[0] && !r[1]) return;           // skip blank rows
    const o = {};
    headers.forEach(function (h, i) { o[h] = fromCell_(h, r[i]); });
    if (!o.id) o.id = "row" + (out.length + 2);
    out.push(o);
  });
  return out;
}

function findRow_(sh, id) {
  const last = sh.getLastRow();
  if (last < 2 || !id) return -1;
  const ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function appendRow_(name, obj) {
  const headers = SHEETS[name];
  if (!obj.id) obj.id = Utilities.getUuid().slice(0, 12);
  sheet_(name).appendRow(headers.map(function (h) { return toCell_(h, obj[h]); }));
}

function updateRow_(name, id, patch) {
  const sh = sheet_(name);
  const row = findRow_(sh, id);
  if (row < 0) return;
  const headers = SHEETS[name];
  Object.keys(patch).forEach(function (h) {
    const col = headers.indexOf(h);
    if (col > 0) sh.getRange(row, col + 1).setValue(toCell_(h, patch[h]));
  });
}

function upsertRow_(name, obj) {
  const sh = sheet_(name);
  const row = findRow_(sh, obj.id);
  if (row < 0) appendRow_(name, obj);
  else { delete obj.id; updateRow_(name, sh.getRange(row, 1).getValue(), obj); }
}

function deleteRow_(name, id) {
  const sh = sheet_(name);
  const row = findRow_(sh, id);
  if (row > 0) sh.deleteRow(row);
}
