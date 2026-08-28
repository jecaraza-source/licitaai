// P2 punch-list B13 — resuelve las credenciales del stack local de
// Supabase sin literales hardcodeados en cada archivo de test.
//
// Orden: variables de entorno (CI las exporta desde `supabase status`) →
// `npx supabase status -o env` (local) → error claro.
//
// La `service_role` key del stack local es la misma en todas las máquinas
// (la fija el CLI de Supabase), pero como matchea el patrón `sb_secret_…`,
// tenerla como literal en ~40 archivos disparaba el push-protection de
// GitHub en cada push. Aquí sale de `supabase status`, no del código.
import { execSync } from "node:child_process";

function desdeStatus() {
  let salida;
  try {
    salida = execSync("npx --no-install supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    try {
      salida = execSync("supabase status -o env", {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      return {};
    }
  }
  const mapa = {};
  for (const linea of salida.split("\n")) {
    const m = /^([A-Z_]+)="?([^"]*)"?$/.exec(linea.trim());
    if (m) mapa[m[1]] = m[2];
  }
  return mapa;
}

let cache;
function resolver() {
  if (cache) return cache;

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (url && anon && service) {
    cache = { url, anonKey: anon, serviceRoleKey: service };
    return cache;
  }

  const s = desdeStatus();
  cache = {
    url: url ?? s.API_URL ?? "http://127.0.0.1:54321",
    // El CLI expone tanto las llaves legacy (JWT: ANON_KEY / SERVICE_ROLE_KEY)
    // como las nuevas (sb_…: PUBLISHABLE_KEY / SECRET_KEY). Ambas sirven en
    // local; se prefieren las nuevas, que es lo que usaban los tests.
    anonKey: anon ?? s.PUBLISHABLE_KEY ?? s.ANON_KEY,
    serviceRoleKey: service ?? s.SECRET_KEY ?? s.SERVICE_ROLE_KEY,
  };

  if (!cache.anonKey || !cache.serviceRoleKey) {
    throw new Error(
      "No hay credenciales de Supabase local. Corre `npx supabase start` " +
        "o exporta SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return cache;
}

/** `{ url, anonKey, serviceRoleKey }` del stack local. */
export const LOCAL = resolver();
