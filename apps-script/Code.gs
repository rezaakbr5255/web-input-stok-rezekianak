// ============================================================
// GOOGLE APPS SCRIPT - INVENTORY API
// Spreadsheet ID: 1smNaBrPR_DoTrnF3wmcw2OYRfEN9NjmkhXh-g8HYgX0
// ============================================================

const SPREADSHEET_ID = '1smNaBrPR_DoTrnF3wmcw2OYRfEN9NjmkhXh-g8HYgX0';
const SHEET_DATA = 'Data Barang';
const SHEET_LOG = 'Log Aktivitas';

// ============================================================
// CORS HEADERS
// ============================================================
function createJsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// GET HANDLER
// ============================================================
function doGet(e) {
  try {
    const action = e.parameter.action;

    if (action === 'getBarang') {
      return createJsonOutput(getBarang());
    } else if (action === 'getLog') {
      return createJsonOutput(getLog());
    } else if (action === 'checkDuplicate') {
      const nama = e.parameter.nama || '';
      return createJsonOutput(checkDuplicate(nama));
    } else {
      return createJsonOutput({ error: 'Action tidak valid', actions: ['getBarang', 'getLog', 'checkDuplicate'] });
    }
  } catch (err) {
    return createJsonOutput({ error: err.message });
  }
}

// ============================================================
// POST HANDLER
// ============================================================
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;

    if (action === 'updateStok') {
      return createJsonOutput(updateStok(body));
    } else if (action === 'tambahBarang') {
      return createJsonOutput(tambahBarang(body));
    } else {
      return createJsonOutput({ error: 'Action tidak valid' });
    }
  } catch (err) {
    return createJsonOutput({ error: err.message });
  }
}

// ============================================================
// GET ALL BARANG
// ============================================================
function getBarang() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_DATA);

  if (!sheet) {
    return { error: 'Sheet "Data Barang" tidak ditemukan' };
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0]; // Row 1 = headers

  const items = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    // Skip empty rows
    if (!row[0] && !row[4]) continue;

    items.push({
      rowIndex: i + 1, // 1-indexed row number in sheet
      no: row[0],           // A: No
      inputan: row[1],      // B: Inputan
      kategori: row[2],     // C: Kategori Barang
      kodeBarang: row[3],   // D: Kode Barang
      nama: row[4],         // E: Nama Barang
      satuan: row[5],       // F: Satuan
      satuan2: row[6],      // G: Satuan #2
      rasio2: row[7],       // H: Rasio Satuan #2
      // I, J might be hidden
      barcode: String(row[10] || '-'),  // K: UPC/Barcode
      barcodeCurai: row[11],            // L: Barcode Curai
      kodeSatuan2: row[12],             // M: Kode Satuan #2
      berat: row[13],                   // N: Berat (gr)
      hargaJual1: row[14],             // O: Def. Hrg. Jual Satuan #1
      hargaJual2: row[15],             // P: Def. Hrg. Jual Satuan #2
      // Q might be hidden
      merek: row[17],                   // R: Merek Barang
      hargaBeli: row[18],              // S: Harga Beli/Modal
      stok: row[19] !== '' && row[19] !== undefined ? Number(row[19]) : 0, // T: STOK
      satuanStok: row[20] || row[5],   // U: Satuan Stok (fallback to Satuan)
      keterangan: row[21]              // V: Keterangan
    });
  }

  return { success: true, data: items, total: items.length };
}

// ============================================================
// UPDATE STOK
// ============================================================
function updateStok(body) {
  const { kodeBarang, jumlah, tipe, keterangan, user, namaBarang } = body;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_DATA);
  const data = sheet.getDataRange().getValues();

  // Find row by Kode Barang (column D, index 3)
  let targetRow = -1;
  let stokSebelum = 0;
  let itemNama = namaBarang || '';

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][3]) === String(kodeBarang)) {
      targetRow = i + 1; // 1-indexed
      stokSebelum = Number(data[i][19]) || 0; // Column T (index 19)
      itemNama = data[i][4] || itemNama; // Column E
      break;
    }
  }

  if (targetRow === -1) {
    return { success: false, error: 'Barang tidak ditemukan (Kode: ' + kodeBarang + ')' };
  }

  const jumlahInt = parseInt(jumlah);
  let stokSesudah;

  if (tipe === 'tambah') {
    stokSesudah = stokSebelum + jumlahInt;
  } else {
    stokSesudah = stokSebelum - jumlahInt;
    if (stokSesudah < 0) stokSesudah = 0;
  }

  // Update stok in column T (index 20 in 1-based = column T)
  sheet.getRange(targetRow, 20).setValue(stokSesudah);

  // Log the activity
  addLog({
    timestamp: new Date(),
    user: user || 'Unknown',
    aksi: tipe,
    kodeBarang: kodeBarang,
    namaBarang: itemNama,
    jumlah: jumlahInt,
    stokSebelum: stokSebelum,
    stokSesudah: stokSesudah,
    keterangan: keterangan || ''
  });

  return {
    success: true,
    stokSebelum: stokSebelum,
    stokSesudah: stokSesudah
  };
}

// ============================================================
// TAMBAH BARANG BARU
// ============================================================
function tambahBarang(body) {
  const { nama, kategori, stok, satuan, barcode, merek, berat, user } = body;

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_DATA);
  const data = sheet.getDataRange().getValues();

  // Check duplicate name
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] && String(data[i][4]).toLowerCase().trim() === String(nama).toLowerCase().trim()) {
      return {
        success: false,
        error: 'Item "' + data[i][4] + '" sudah ada! (Baris ' + (i + 1) + ')',
        duplicate: true,
        existingItem: {
          nama: data[i][4],
          kategori: data[i][2],
          kodeBarang: data[i][3],
          stok: data[i][19]
        }
      };
    }
  }

  // Generate No and Kode Barang
  let maxNo = 0;
  let maxKode = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] && Number(data[i][0]) > maxNo) maxNo = Number(data[i][0]);
    if (data[i][3] && Number(data[i][3]) > maxKode) maxKode = Number(data[i][3]);
  }

  const newNo = maxNo + 1;
  const newKode = maxKode + 1;

  // Build new row (match spreadsheet columns A-V)
  // A:No, B:Inputan, C:Kategori, D:Kode, E:Nama, F:Satuan, G:Sat2, H:Rasio2,
  // I:?, J:?, K:Barcode, L:BC Curai, M:Kode Sat2, N:Berat,
  // O:HrgJual1, P:HrgJual2, Q:?, R:Merek, S:HrgBeli, T:Stok, U:SatStok, V:Ket
  const newRow = [
    newNo,                    // A: No
    user || '',               // B: Inputan (who added it)
    kategori || '',           // C: Kategori
    newKode,                  // D: Kode Barang
    nama || '',               // E: Nama Barang
    satuan || 'Pcs',          // F: Satuan
    '',                       // G: Satuan #2
    '',                       // H: Rasio
    '',                       // I
    '',                       // J
    barcode || '-',           // K: Barcode
    '',                       // L: BC Curai
    '',                       // M: Kode Sat2
    berat || '',              // N: Berat
    '',                       // O: Hrg Jual 1
    '',                       // P: Hrg Jual 2
    '',                       // Q
    merek || '',              // R: Merek
    '',                       // S: Hrg Beli
    parseInt(stok) || 0,      // T: Stok
    satuan || 'Pcs',          // U: Satuan Stok
    'web-input (' + (user || 'unknown') + ')'  // V: Keterangan
  ];

  sheet.appendRow(newRow);

  // Log the addition
  addLog({
    timestamp: new Date(),
    user: user || 'Unknown',
    aksi: 'tambah_barang',
    kodeBarang: newKode,
    namaBarang: nama,
    jumlah: parseInt(stok) || 0,
    stokSebelum: 0,
    stokSesudah: parseInt(stok) || 0,
    keterangan: 'Item baru ditambahkan via web'
  });

  return {
    success: true,
    kodeBarang: newKode,
    no: newNo
  };
}

// ============================================================
// CHECK DUPLICATE
// ============================================================
function checkDuplicate(nama) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_DATA);
  const data = sheet.getDataRange().getValues();

  const matches = [];
  const searchLower = nama.toLowerCase().trim();

  for (let i = 1; i < data.length; i++) {
    const itemName = String(data[i][4] || '').toLowerCase().trim();
    if (itemName && (itemName.includes(searchLower) || searchLower.includes(itemName))) {
      matches.push({
        nama: data[i][4],
        kategori: data[i][2],
        kodeBarang: data[i][3],
        stok: data[i][19]
      });
    }
  }

  return { matches: matches, count: matches.length };
}

// ============================================================
// LOG FUNCTIONS
// ============================================================
function addLog(logData) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let logSheet = ss.getSheetByName(SHEET_LOG);

  // Create log sheet if it doesn't exist
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_LOG);
    logSheet.appendRow([
      'Timestamp', 'User', 'Aksi', 'Kode Barang',
      'Nama Barang', 'Jumlah', 'Stok Sebelum',
      'Stok Sesudah', 'Keterangan'
    ]);

    // Format header
    const headerRange = logSheet.getRange(1, 1, 1, 9);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4f46e5');
    headerRange.setFontColor('#ffffff');
  }

  logSheet.appendRow([
    logData.timestamp,
    logData.user,
    logData.aksi,
    logData.kodeBarang,
    logData.namaBarang,
    logData.jumlah,
    logData.stokSebelum,
    logData.stokSesudah,
    logData.keterangan
  ]);
}

function getLog() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const logSheet = ss.getSheetByName(SHEET_LOG);

  if (!logSheet) {
    return [];
  }

  const data = logSheet.getDataRange().getValues();
  const logs = [];

  // Read from bottom to top (newest first), skip header
  for (let i = data.length - 1; i >= 1; i--) {
    logs.push({
      timestamp: data[i][0],
      user: data[i][1],
      aksi: data[i][2],
      kodeBarang: data[i][3],
      namaBarang: data[i][4],
      jumlah: data[i][5],
      stokSebelum: data[i][6],
      stokSesudah: data[i][7],
      keterangan: data[i][8]
    });

    // Limit to 50 most recent
    if (logs.length >= 50) break;
  }

  return logs;
}

// ============================================================
// TEST FUNCTION (run manually in script editor)
// ============================================================
function testGetBarang() {
  const result = getBarang();
  Logger.log('Total items: ' + result.total);
  Logger.log('First item: ' + JSON.stringify(result.data[0]));
}
