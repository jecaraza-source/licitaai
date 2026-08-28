// P0.5 — unit tests for magic-byte content validation
// (supabase/functions/_shared/file-validation.ts). This is what actually
// inspects file CONTENT server-side — the storage.buckets.allowed_mime_types
// allowlist (migration 20260826220000) only validates the Content-Type a
// client declares at upload time, which is trivially spoofable.
// Run: npx tsx tests/unit/file-validation.test.mjs
import {
  detectarTipoPorMagicBytes,
  contenidoCoincideConNombre,
} from "../../supabase/functions/_shared/file-validation.ts";

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

const PDF_BYTES = new TextEncoder().encode("%PDF-1.4\n%âãÏÓ\n1 0 obj");
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const EXE_BYTES = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // "MZ" — Windows PE header
const RANDOM_BYTES = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
const EMPTY_BYTES = new Uint8Array([]);

// --- detectarTipoPorMagicBytes ---
check("detects PDF magic bytes", detectarTipoPorMagicBytes(PDF_BYTES) === "pdf");
check("detects ZIP/OOXML magic bytes (docx/xlsx)", detectarTipoPorMagicBytes(ZIP_BYTES) === "docx-o-xlsx");
check("detects JPEG magic bytes", detectarTipoPorMagicBytes(JPEG_BYTES) === "jpeg");
check("detects PNG magic bytes", detectarTipoPorMagicBytes(PNG_BYTES) === "png");
check("EXE (MZ header) is 'desconocido', not any known document type", detectarTipoPorMagicBytes(EXE_BYTES) === "desconocido");
check("random bytes are 'desconocido'", detectarTipoPorMagicBytes(RANDOM_BYTES) === "desconocido");
check("empty buffer is 'desconocido', doesn't throw", detectarTipoPorMagicBytes(EMPTY_BYTES) === "desconocido");

// --- contenidoCoincideConNombre: happy paths ---
check("real PDF content + .pdf name matches", contenidoCoincideConNombre(PDF_BYTES, "documento.pdf") === true);
check("real ZIP content + .docx name matches", contenidoCoincideConNombre(ZIP_BYTES, "documento.docx") === true);
check("real ZIP content + .xlsx name matches", contenidoCoincideConNombre(ZIP_BYTES, "documento.xlsx") === true);
check("real JPEG content + .jpg name matches", contenidoCoincideConNombre(JPEG_BYTES, "foto.jpg") === true);
check("real JPEG content + .jpeg name matches", contenidoCoincideConNombre(JPEG_BYTES, "foto.jpeg") === true);
check("real PNG content + .png name matches", contenidoCoincideConNombre(PNG_BYTES, "foto.png") === true);

// --- contenidoCoincideConNombre: the actual attack this guards against ---
// An executable renamed to look like a PDF, or any content/extension
// mismatch a spoofed Content-Type header could sneak past the storage
// allowlist.
check("EXE renamed to .pdf is rejected", contenidoCoincideConNombre(EXE_BYTES, "documento.pdf") === false);
check("random bytes renamed to .pdf is rejected", contenidoCoincideConNombre(RANDOM_BYTES, "documento.pdf") === false);
check("PDF content renamed to .docx is rejected (wrong real type)", contenidoCoincideConNombre(PDF_BYTES, "documento.docx") === false);
check("JPEG content renamed to .pdf is rejected", contenidoCoincideConNombre(JPEG_BYTES, "documento.pdf") === false);
check("PNG content renamed to .jpg is rejected", contenidoCoincideConNombre(PNG_BYTES, "foto.jpg") === false);
check("empty file claiming .pdf is rejected", contenidoCoincideConNombre(EMPTY_BYTES, "documento.pdf") === false);

// --- contenidoCoincideConNombre: extensions with no magic-byte signature
// (e.g. .txt for referencias-legales) are not blocked by this check —
// there's no universal plain-text signature to verify against.
check("unrecognized extension (.txt) is not blocked by this check", contenidoCoincideConNombre(RANDOM_BYTES, "ley.txt") === true);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
