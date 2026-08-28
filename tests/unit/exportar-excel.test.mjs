// P0.4 — regression test for the exceljs-based .xlsx generation that
// replaced `xlsx` (SheetJS), which has an unpatched Prototype
// Pollution/ReDoS advisory. This app only ever GENERATES .xlsx files
// (partidas-tab.tsx, propuesta-economica-tab.tsx) — no code path parses
// user-uploaded .xlsx content with any library (procesar-documento
// explicitly skips non-PDF files), so the actual CVE exploit surface
// (malicious parsing) never existed here; this test just guards the
// generation logic itself, including formula cells.
// Run: npx tsx tests/unit/exportar-excel.test.mjs
import ExcelJS from "exceljs";
import { writeFileSync, mkdtempSync } from "fs";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";

let pass = 0;
let fail = 0;
function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// Mirrors propuesta-economica-tab.tsx's exportarExcel() exactly.
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Propuesta Económica");
sheet.addRow(["#", "Descripción", "Cantidad", "Unidad", "P.U. Referencia", "P.U. Ofertado", "Subtotal", "IVA", "Total"]);
const filas = [
  { descripcion: "Concepto A", cantidad: 2, unidad: "PZA", precio_referencia_mercado: 100, precio_unitario_ofertado: 95 },
  { descripcion: "Concepto B", cantidad: 5, unidad: "SERV", precio_referencia_mercado: 200, precio_unitario_ofertado: 210 },
];
filas.forEach((f, i) => {
  const row = i + 2;
  sheet.addRow([i + 1, f.descripcion, f.cantidad, f.unidad, f.precio_referencia_mercado, f.precio_unitario_ofertado]);
  sheet.getCell(`G${row}`).value = { formula: `C${row}*F${row}` };
  sheet.getCell(`H${row}`).value = { formula: `G${row}*0.16` };
  sheet.getCell(`I${row}`).value = { formula: `G${row}+H${row}` };
});

const buffer = await workbook.xlsx.writeBuffer();
const bytes = new Uint8Array(buffer);

check("generates a non-empty buffer", bytes.byteLength > 0);
// .xlsx is a zip (OOXML) — magic bytes "PK\x03\x04".
check("output has the .xlsx (zip/OOXML) magic bytes", bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04);

const dir = mkdtempSync(join(tmpdir(), "xlsx-test-"));
const xlsxPath = join(dir, "test.xlsx");
writeFileSync(xlsxPath, bytes);
const listing = execFileSync("unzip", ["-l", xlsxPath], { encoding: "utf-8" });
check("archive contains [Content_Types].xml", listing.includes("[Content_Types].xml"));
check("archive contains a worksheet", /xl\/worksheets\/sheet\d+\.xml/.test(listing));

const sheetXml = execFileSync("unzip", ["-p", xlsxPath, "xl/worksheets/sheet1.xml"], {
  encoding: "utf-8",
});
check("formula for Subtotal (G2) is present in the sheet XML", sheetXml.includes("C2*F2"));
check("formula for IVA (H2) is present in the sheet XML", sheetXml.includes("G2*0.16"));
check("formula for Total (I2) is present in the sheet XML", sheetXml.includes("G2+H2"));
check("second row's formulas are present too", sheetXml.includes("C3*F3"));

// Round-trip: re-reading the generated file with ExcelJS itself confirms
// it's structurally valid, not just that the raw bytes look zip-shaped.
const readBack = new ExcelJS.Workbook();
await readBack.xlsx.load(buffer);
const readSheet = readBack.getWorksheet("Propuesta Económica");
check("re-read workbook has the expected sheet", !!readSheet);
check("re-read sheet has header + 2 data rows", readSheet.rowCount === 3);
check("re-read header row matches", readSheet.getRow(1).getCell(2).value === "Descripción");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
