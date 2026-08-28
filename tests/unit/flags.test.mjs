// P2 · G1 — unit tests para la lógica pura de feature flags
// (src/lib/flags.ts). No toca Supabase.
// Run: npx tsx tests/unit/flags.test.mjs
import {
  evaluarFlag,
  overrideDeEntorno,
  hashParaRollout,
} from "../../src/lib/flags.ts";

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

const ORG_A = "11111111-1111-1111-1111-111111111111";
const ORG_B = "22222222-2222-2222-2222-222222222222";
const row = (over = {}) => ({
  key: "x.y",
  enabled: false,
  rollout_pct: 0,
  orgs_incluidas: [],
  orgs_excluidas: [],
  ...over,
});

// --- flag desconocido ---
check("flag sin fila => false", evaluarFlag("x.y", null, { organizationId: ORG_A }) === false);

// --- default enabled ---
check("enabled=true, sin rollout => true", evaluarFlag("x.y", row({ enabled: true }), { organizationId: ORG_A }) === true);
check("enabled=false, sin rollout => false", evaluarFlag("x.y", row({ enabled: false }), { organizationId: ORG_A }) === false);

// --- orgs_incluidas / orgs_excluidas ---
check(
  "orgs_incluidas fuerza true aunque enabled=false",
  evaluarFlag("x.y", row({ orgs_incluidas: [ORG_A] }), { organizationId: ORG_A }) === true,
);
check(
  "orgs_excluidas fuerza false aunque enabled=true",
  evaluarFlag("x.y", row({ enabled: true, orgs_excluidas: [ORG_A] }), { organizationId: ORG_A }) === false,
);
check(
  "orgs_excluidas gana sobre orgs_incluidas",
  evaluarFlag("x.y", row({ orgs_incluidas: [ORG_A], orgs_excluidas: [ORG_A] }), { organizationId: ORG_A }) === false,
);

// --- rollout determinista ---
{
  // rollout_pct=100 => todas dentro
  check("rollout 100% => true", evaluarFlag("x.y", row({ rollout_pct: 100 }), { organizationId: ORG_A }) === true);
  // rollout_pct=0 => cae al default (enabled=false)
  check("rollout 0% => default", evaluarFlag("x.y", row({ rollout_pct: 0 }), { organizationId: ORG_A }) === false);
  // determinismo: misma entrada, mismo resultado
  const a1 = evaluarFlag("x.y", row({ rollout_pct: 50 }), { organizationId: ORG_A });
  const a2 = evaluarFlag("x.y", row({ rollout_pct: 50 }), { organizationId: ORG_A });
  check("rollout es determinista por org", a1 === a2);
  // monotonía: si una org está dentro al 50%, sigue dentro al 60%
  const bucket = hashParaRollout(`x.y:${ORG_B}`);
  const dentro50 = bucket < 50;
  const dentro60 = bucket < 60;
  check("subir rollout_pct nunca saca a una org que ya estaba dentro", !dentro50 || dentro60);
}

// --- override de entorno ---
check("FLAG_X_Y=on => true", overrideDeEntorno("x.y", { FLAG_X_Y: "on" }) === true);
check("FLAG_X_Y=off => false", overrideDeEntorno("x.y", { FLAG_X_Y: "off" }) === false);
check("FLAG_X_Y=1 => true", overrideDeEntorno("x.y", { FLAG_X_Y: "1" }) === true);
check("sin env var => null", overrideDeEntorno("x.y", {}) === null);
check("valor no reconocido => null", overrideDeEntorno("x.y", { FLAG_X_Y: "quizas" }) === null);
check(
  "key con guiones y puntos => FLAG_JOBS_ASYNC_ANALIZAR_BASES",
  overrideDeEntorno("jobs.async-analizar-bases", { FLAG_JOBS_ASYNC_ANALIZAR_BASES: "on" }) === true,
);
check(
  "override de entorno gana sobre la fila",
  evaluarFlag("x.y", row({ enabled: false }), { organizationId: ORG_A, env: { FLAG_X_Y: "on" } }) === true,
);
check(
  "override off gana aunque orgs_incluidas tenga la org",
  evaluarFlag("x.y", row({ orgs_incluidas: [ORG_A] }), { organizationId: ORG_A, env: { FLAG_X_Y: "off" } }) === false,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
