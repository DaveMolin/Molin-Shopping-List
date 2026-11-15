/**
 * Molin Shopping List — Google Sheets backend (version 2)
 *
 * Paste this whole file into Extensions > Apps Script of your Google Sheet.
 * First time: change FAMILY_PASSCODE, run `setup` once, then Deploy > New deployment > Web app
 *   (Execute as "Me", Who has access "Anyone").
 * Updating: paste over the old code, keep your passcode, Save, then
 *   Deploy > Manage deployments > pencil icon > Version: New version > Deploy. The URL stays the same.
 * New tabs and columns are added automatically the first time the app talks to the sheet.
 */

const FAMILY_PASSCODE = "change-me";

// Columns are only ever added at the end, so older sheets keep working.
const SHEETS = {
  Items:   ["id", "name", "brand", "qty", "store", "price", "addedBy", "claimedBy", "done", "doneBy", "reported", "createdAt", "meal"],
  Saved:   ["id", "name", "brand", "qty", "store", "price", "savedBy"],
  Updates: ["id", "by", "count", "missedCount", "items", "missed", "stores", "total", "at", "type", "got"],
  Meals:   ["id", "name", "ingredients", "store", "createdBy", "updatedAt"],
  Archive: ["archiveId", "archivedAt", "archivedBy", "name", "brand", "qty", "store", "done", "doneBy", "meal", "addedBy"],
};

const STORE_NAMES = {
  costco: "Costco", shoprite: "ShopRite", fooduniverse: "Food Universe",
  stopandshop: "Stop & Shop", amazon: "Amazon", other: "Other",
};
const LIST_SEP = " · ";
const DATE_FIELDS = { createdAt: true, at: true, updatedAt: true, archivedAt: true };
const BOOL_FIELDS = { done: true, reported: true };
const NUM_FIELDS = { qty: true, price: true, count: true, missedCount: true, total: true, got: true };
const LIST_FIELDS = { items: true, missed: true, stores: true };

/* ---------------- setup (run once; also runs itself when needed) ---------------- */

function setup() {
  ensureSheets_(true);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const def = ss.getSheetByName("Sheet1");
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function ensureSheets_(force) {
  if (!force && schemaReady_()) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    const headers = SHEETS[name];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sh.setFrozenRows(1);
  });
  ss.getSheetByName("Items").getRange("I2:I").insertCheckboxes();
  ss.getSheetByName("Items").getRange("K2:K").insertCheckboxes();
  ss.getSheetByName("Items").getRange("L2:L").setNumberFormat("yyyy-mm-dd h:mm am/pm");
  ss.getSheetByName("Updates").getRange("I2:I").setNumberFormat("yyyy-mm-dd h:mm am/pm");
  ss.getSheetByName("Meals").getRange("F2:F").setNumberFormat("yyyy-mm-dd h:mm am/pm");
  ss.getSheetByName("Archive").getRange("B2:B").setNumberFormat("yyyy-mm-dd h:mm am/pm");
  ss.getSheetByName("Archive").getRange("H2:H").insertCheckboxes();
}

function schemaReady_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss.getSheetByName("Meals") || !ss.getSheetByName("Archive")) return false;
  const items = ss.getSheetByName("Items"), upd = ss.getSheetByName("Updates");
  return !!items && !!upd &&
    items.getRange(1, SHEETS.Items.length).getValue() === "meal" &&
    upd.getRange(1, SHEETS.Updates.length).getValue() === "got";
}

/* ---------------- web app entry points ---------------- */

function doGet(e) {
  return handle_(function () {
    const p = (e && e.parameter) || {};
    checkKey_(p.key);
    ensureSheets_(false);
    if (p.action === "ping") return { ok: true };
    if (p.action === "archive") return { ok: true, archive: readArchive_() };
    return {
      ok: true,
      items: readAll_("Items"),
      saved: readAll_("Saved"),
      meals: readAll_("Meals"),
      updates: readAll_("Updates").sort(function (a, b) { return b.at - a.at; }).slice(0, 10),
    };
  });
}

function doPost(e) {
  return handle_(function () {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    checkKey_(body.key);
    ensureSheets_(false);
    const lock = LockService.getScriptLock();
    lock.waitLock(15000);
    try {
      switch (body.action) {
        case "addItem":      appendRow_("Items", clean_(body.item, SHEETS.Items)); break;
        case "addItems":     appendRows_("Items", (body.items || []).map(function (i) { return clean_(i, SHEETS.Items); })); break;
        case "updateItem":   updateRow_("Items", body.id, clean_(body.patch, SHEETS.Items)); break;
        case "deleteItem":   deleteRow_("Items", body.id); break;
        case "deleteItems":  deleteRows_("Items", body.ids || []); break;
        case "saveQuick":    upsertRow_("Saved", clean_(body.saved, SHEETS.Saved)); break;
        case "deleteQuick":  deleteRow_("Saved", body.id); break;
        case "saveMeal":     upsertRow_("Meals", clean_(body.meal, SHEETS.Meals)); break;
        case "deleteMeal":   deleteRow_("Meals", body.id); break;
        case "saveUpdate":   upsertRow_("Updates", clean_(body.update, SHEETS.Updates)); break;
        case "completeTrip":
          upsertRow_("Updates", clean_(body.update, SHEETS.Updates));
          (body.gotIds || []).forEach(function (id) { updateRow_("Items", id, { reported: true }); });
          (body.missedIds || []).forEach(function (id) { updateRow_("Items", id, { claimedBy: "" }); });
          break;
        case "archiveList":  archiveList_(body.archiveId, body.by, body.ids || []); break;
        default: throw new Error("Unknown action");
      }
      SpreadsheetApp.flush();
    } finally {
      lock.releaseLock();
    }
    return { ok: true };
  });
}

/* ---------------- archive ---------------- */

function archiveList_(archiveId, by, ids) {
  const items = sheet_("Items");
  const headers = SHEETS.Items;
  const last = items.getLastRow();
  if (last < 2 || !ids.length) return;
  const want = {};
  ids.forEach(function (id) { want[String(id)] = true; });
  const rows = items.getRange(2, 1, last - 1, headers.length).getValues();
  const now = new Date();
  const out = [], toDelete = [];
  rows.forEach(function (r, i) {
    if (!want[String(r[0])]) return;
    const o = {};
    headers.forEach(function (h, j) { o[h] = fromCell_(h, r[j]); });
    out.push(SHEETS.Archive.map(function (h) {
      if (h === "archiveId") return archiveId || Utilities.getUuid().slice(0, 12);
      if (h === "archivedAt") return now;
      if (h === "archivedBy") return String(by || "");
      return toCell_(h, o[h]);
    }));
    toDelete.push(i + 2);
  });
  if (out.length) {
    const arc = sheet_("Archive");
    arc.getRange(arc.getLastRow() + 1, 1, out.length, SHEETS.Archive.length).setValues(out);
  }
  toDelete.reverse().forEach(function (row) { items.deleteRow(row); });
}

function readArchive_() {
  const sh = sheet_("Archive");
  const headers = SHEETS.Archive;
  const last = sh.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - 1500);   // the most recent ~1500 archived items
  return sh.getRange(start, 1, last - start + 1, headers.length).getValues()
    .filter(function (r) { return r[0] && r[3]; })
    .map(function (r) {
      const o = {};
      headers.forEach(function (h, i) { o[h] = fromCell_(h, r[i]); });
      return o;
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
  return String(v).slice(0, 2000);
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
  rows.forEach(function (r, i) {
    if (!r[0] && !r[1]) return;           // skip blank rows
    const o = {};
    headers.forEach(function (h, j) { o[h] = fromCell_(h, r[j]); });
    if (!o.id) {                          // a row typed straight into the sheet: give it an id
      o.id = Utilities.getUuid().slice(0, 12);
      sh.getRange(i + 2, 1).setValue(o.id);
    }
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

function rowOf_(name, obj) {
  if (!obj.id) obj.id = Utilities.getUuid().slice(0, 12);
  return SHEETS[name].map(function (h) { return toCell_(h, obj[h]); });
}

function appendRow_(name, obj) {
  sheet_(name).appendRow(rowOf_(name, obj));
}

function appendRows_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name);
  sh.getRange(sh.getLastRow() + 1, 1, objs.length, SHEETS[name].length)
    .setValues(objs.map(function (o) { return rowOf_(name, o); }));
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
  if (row < 0) { appendRow_(name, obj); return; }
  const id = obj.id;
  delete obj.id;
  updateRow_(name, id, obj);
}

function deleteRow_(name, id) {
  const sh = sheet_(name);
  const row = findRow_(sh, id);
  if (row > 0) sh.deleteRow(row);
}

function deleteRows_(name, ids) {
  const sh = sheet_(name);
  const want = {};
  ids.forEach(function (id) { want[String(id)] = true; });
  const last = sh.getLastRow();
  if (last < 2) return;
  const col = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = col.length - 1; i >= 0; i--) if (want[String(col[i][0])]) sh.deleteRow(i + 2);
}
