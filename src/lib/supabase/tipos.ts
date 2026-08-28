// P1.4 — helpers para consumir los tipos generados del esquema real
// (`database.types.ts`, regenerado con `npm run typegen` desde el stack
// local). Se regeneran automáticamente en CI (`supabase-tests`) y un
// `git diff --exit-code` falla si el archivo committeado no coincide con
// las migraciones — así el esquema y sus tipos no se desincronizan.
//
// Uso:
//   import type { Fila, Insert, Enum } from "@/lib/supabase/tipos";
//   const lic: Fila<"licitaciones"> = ...;
//   const nueva: Insert<"licitaciones"> = { ... };
//   type Estado = Enum<"estado_licitacion_enum">; // si existe un enum nativo
import type { Database } from "./database.types";

type PublicSchema = Database["public"];

export type Fila<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];

export type Insert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];

export type Update<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];

export type FuncionArgs<T extends keyof PublicSchema["Functions"]> =
  PublicSchema["Functions"][T]["Args"];

export type FuncionRetorno<T extends keyof PublicSchema["Functions"]> =
  PublicSchema["Functions"][T]["Returns"];

export type { Database, Json } from "./database.types";
