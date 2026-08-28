// P0.6 (additional finding, non-security) — unit tests for
// bloqueDocumentoParaClaude (supabase/functions/_shared/anthropic-content-block.ts).
// Before this fix, auditar-documento and analizar-documento-corporativo sent
// scanned images (JPEG) through a `type: "document"` content block, which
// the Anthropic API only accepts for application/pdf — auditing/analyzing
// any image-based document would have failed the model call entirely.
// Run: npx tsx tests/unit/anthropic-content-block.test.mjs
import { bloqueDocumentoParaClaude } from "../../supabase/functions/_shared/anthropic-content-block.ts";

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

const pdfBlock = bloqueDocumentoParaClaude("application/pdf", "ZmFrZQ==");
check("a PDF media type produces a 'document' content block", pdfBlock.type === "document");
check("the PDF block preserves the media_type", pdfBlock.source.media_type === "application/pdf");

const jpegBlock = bloqueDocumentoParaClaude("image/jpeg", "ZmFrZQ==");
check(
  "a JPEG media type produces an 'image' content block, NOT 'document' (the actual bug being fixed)",
  jpegBlock.type === "image",
);
check("the JPEG block preserves the media_type", jpegBlock.source.media_type === "image/jpeg");

const pngBlock = bloqueDocumentoParaClaude("image/png", "ZmFrZQ==");
check("a PNG media type also produces an 'image' content block", pngBlock.type === "image");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
