const SHEET_NAME = 'Budget';
const HEADERS = ['id', 'name', 'amount', 'type'];

function getBudgetSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.getSheets()[0];
  }

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  const headerValues = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (JSON.stringify(headerValues) !== JSON.stringify(HEADERS)) {
    sheet.getRange(1, 1, HEADERS.length).setValues([HEADERS]);
  }

  return sheet;
}

function buildResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const sheet = getBudgetSheet();
  const items = readSheetData(sheet);
  const action = (e.parameter.action || 'list').toString().toLowerCase();

  if (action === 'get' && e.parameter.id) {
    const item = items.find((row) => row.id === e.parameter.id);
    return buildResponse({ success: true, item: item || null });
  }

  return buildResponse({ success: true, items });
}

function doPost(e) {
  const sheet = getBudgetSheet();
  const data = parseRequestBody(e);
  const action = (data.action || e.parameter.action || 'list').toString().toLowerCase();

  if (action === 'create') {
    return buildResponse(createBudgetItem(sheet, data));
  }

  if (action === 'update') {
    return buildResponse(updateBudgetItem(sheet, data));
  }

  if (action === 'delete') {
    return buildResponse(deleteBudgetItem(sheet, data));
  }

  return buildResponse({ success: true, items: readSheetData(sheet) });
}

function parseRequestBody(e) {
  if (!e.postData || !e.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (error) {
    return {};
  }
}

function readSheetData(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  return values.map((row) => ({
    id: row[0].toString(),
    name: row[1].toString(),
    amount: Number(row[2]) || 0,
    type: row[3].toString() === 'expense' ? 'expense' : 'income',
  }));
}

function createBudgetItem(sheet, data) {
  const newItem = {
    id: (data.id || Utilities.getUuid()).toString(),
    name: (data.name || '').toString().trim(),
    amount: Number(data.amount) || 0,
    type: data.type === 'expense' ? 'expense' : 'income',
  };

  if (!newItem.name || newItem.amount <= 0) {
    return { success: false, error: 'Invalid item payload' };
  }

  const nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, HEADERS.length).setValues([[newItem.id, newItem.name, newItem.amount, newItem.type]]);
  return { success: true, item: newItem };
}

function updateBudgetItem(sheet, data) {
  const itemId = (data.id || '').toString();
  if (!itemId) {
    return { success: false, error: 'Missing item id' };
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  const rowIndex = values.findIndex((row) => row[0].toString() === itemId);
  if (rowIndex === -1) {
    return { success: false, error: 'Item not found' };
  }

  const updatedItem = {
    id: itemId,
    name: (data.name || values[rowIndex][1]).toString().trim(),
    amount: Number(data.amount) || Number(values[rowIndex][2]) || 0,
    type: data.type === 'expense' ? 'expense' : (data.type === 'income' ? 'income' : values[rowIndex][3].toString()),
  };

  sheet.getRange(rowIndex + 2, 1, 1, HEADERS.length).setValues([[updatedItem.id, updatedItem.name, updatedItem.amount, updatedItem.type]]);
  return { success: true, item: updatedItem };
}

function deleteBudgetItem(sheet, data) {
  const itemId = (data.id || '').toString();
  if (!itemId) {
    return { success: false, error: 'Missing item id' };
  }

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues();
  const rowIndex = values.findIndex((row) => row[0].toString() === itemId);
  if (rowIndex === -1) {
    return { success: false, error: 'Item not found' };
  }

  sheet.deleteRow(rowIndex + 2);
  return { success: true, id: itemId };
}
