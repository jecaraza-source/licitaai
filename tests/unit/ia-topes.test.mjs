// Unit tests de la consola de IA (src/lib/ia-topes.ts): validación de topes y
// cálculo del nivel de uso que pinta la barra de Configuración.
// Run: npx tsx tests/unit/ia-topes.test.mjs
import { formatoUsd, nivelUso, porcentajeUso, topesSchema } from "../../src/lib/ia-topes.ts";

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

const ORG = "8a0ded03-628f-414c-a804-ae08bb6f9f9c";
const base = { organization_id: ORG, cuota_mensual_usd: 15, limite_diario_usd: 2, topes_usd_activos: true };

// --- validación
check("topes válidos pasan", topesSchema.safeParse(base).success);
check("diario igual a la cuota pasa", topesSchema.safeParse({ ...base, limite_diario_usd: 15 }).success);
check("diario mayor que la cuota se rechaza", !topesSchema.safeParse({ ...base, limite_diario_usd: 20 }).success);
check("tope 0 es válido (apaga la IA)", topesSchema.safeParse({ ...base, cuota_mensual_usd: 0, limite_diario_usd: 0 }).success);
check("cuota negativa se rechaza", !topesSchema.safeParse({ ...base, cuota_mensual_usd: -1 }).success);
check("cuota sobre el máximo se rechaza", !topesSchema.safeParse({ ...base, cuota_mensual_usd: 10_001 }).success);
check("diario sobre el máximo se rechaza", !topesSchema.safeParse({ ...base, cuota_mensual_usd: 5000, limite_diario_usd: 1001 }).success);
check("número como texto se rechaza (la API no convierte)", !topesSchema.safeParse({ ...base, cuota_mensual_usd: "15" }).success);
check("organization_id inválido se rechaza", !topesSchema.safeParse({ ...base, organization_id: "abc" }).success);
check("topes_usd_activos obligatorio", !topesSchema.safeParse({ ...base, topes_usd_activos: undefined }).success);
{
  const r = topesSchema.safeParse({ ...base, limite_diario_usd: 20 });
  check("el mensaje del error es legible", !r.success && /diario/i.test(r.error.issues[0].message));
}

// --- porcentaje
check("sin gasto el porcentaje es 0", porcentajeUso(0, 15) === 0);
check("la mitad es 50", porcentajeUso(7.5, 15) === 50);
check("redondea a un decimal", porcentajeUso(1, 3) === 33.3);
check("puede pasar de 100", porcentajeUso(30, 15) === 200);
check("tope 0 con gasto es 100", porcentajeUso(0.5, 0) === 100);
check("tope 0 sin gasto es 0", porcentajeUso(0, 0) === 0);
check("gasto negativo o NaN cuenta como 0", porcentajeUso(-5, 15) === 0 && porcentajeUso(NaN, 15) === 0);

// --- nivel
check("49 % es normal", nivelUso(49) === "normal");
check("50 % sigue normal (primer umbral solo informa)", nivelUso(50) === "normal");
check("80 % es atención", nivelUso(80) === "atencion");
check("95 % es crítico", nivelUso(95) === "critico");
check("99.9 % es crítico", nivelUso(99.9) === "critico");
check("100 % es agotado", nivelUso(100) === "agotado");
check("más de 100 % es agotado", nivelUso(250) === "agotado");
check("respeta umbrales propios", nivelUso(60, [30, 60, 90]) === "atencion" && nivelUso(90, [30, 60, 90]) === "critico");
check("umbrales desordenados se ordenan", nivelUso(95, [95, 50, 80]) === "critico");
check("lista vacía usa valores por defecto", nivelUso(96, []) === "critico" && nivelUso(85, []) === "atencion");
check("un solo umbral no rompe", nivelUso(90, [90]) === "critico" && nivelUso(70, [90]) === "normal");

// --- formato
check("formato USD con dos decimales", formatoUsd(15) === "$15.00 USD", formatoUsd(15));
check("formato USD con miles", formatoUsd(1234.5) === "$1,234.50 USD", formatoUsd(1234.5));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
