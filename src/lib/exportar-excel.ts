import ExcelJS from "exceljs";

/**
 * Genera un .xlsx desde un ExcelJS.Workbook (construido por quien llama) y
 * dispara la descarga en el navegador. Reemplaza `xlsx` (SheetJS), que
 * tiene una vulnerabilidad de Prototype Pollution/ReDoS sin parche en el
 * registro de npm — ver P0.4 en docs/security-p0-hardening.md.
 */
export async function descargarWorkbook(workbook: ExcelJS.Workbook, nombreArchivo: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
}
