"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// P1.5 — separa "estado + consultas + Realtime" de la presentación.
//
// El patrón que documentos-tab / analisis-ia-tab / junta / seguimiento
// repetían a mano: cargar una lista filtrada por `licitacion_id`, abrir un
// canal `postgres_changes` con el mismo filtro, reducir INSERT/UPDATE/
// DELETE sobre el estado, y —lo que es fácil olvidar— `removeChannel` al
// desmontar. Aquí ocurre una sola vez, con la limpieza garantizada.

interface Opciones<TFila extends { id: string }, TItem extends { id: string } = TFila> {
  tabla: string;
  /** Filtro de PostgREST/Realtime, p. ej. `licitacion_id=eq.<uuid>`. */
  filtro: string;
  /** Columnas del SELECT inicial (default `"*"`). */
  select?: string;
  orden?: { columna: string; ascendente?: boolean };
  /** Datos del render del servidor, para no parpadear al montar. */
  inicial?: TItem[];
  /** Proyección fila→item (default identidad). */
  mapear?: (fila: TFila) => TItem;
  /** Si devuelve false, la fila se excluye de la lista (p. ej. `procesado === true`). */
  incluir?: (fila: TFila) => boolean;
  /** Efecto lateral en INSERT/UPDATE (p. ej. un toast "terminó de procesarse"). */
  alCambiar?: (fila: TFila, evento: "INSERT" | "UPDATE") => void;
  /** Desactiva la suscripción (p. ej. mientras no hay id). */
  activo?: boolean;
}

interface Resultado<TItem> {
  items: TItem[];
  setItems: React.Dispatch<React.SetStateAction<TItem[]>>;
  recargar: () => Promise<void>;
  cargando: boolean;
  error: string | null;
}

export function useRealtimeLista<
  TFila extends { id: string },
  TItem extends { id: string } = TFila,
>(opts: Opciones<TFila, TItem>): Resultado<TItem> {
  const {
    tabla,
    filtro,
    select = "*",
    orden,
    inicial,
    mapear,
    incluir,
    alCambiar,
    activo = true,
  } = opts;

  const [items, setItems] = useState<TItem[]>(inicial ?? []);
  const [cargando, setCargando] = useState(!inicial);
  const [error, setError] = useState<string | null>(null);

  // Sufijo estable por instancia — distintas pestañas (documentos, análisis
  // IA, junta…) llaman a este hook con el mismo `tabla`+`filtro`. Sin esto,
  // el nombre de canal `${tabla}:${filtro}` colisiona entre ellas: si la
  // pestaña anterior aún no ha limpiado su canal (el desmontaje de
  // TabsPanel es asíncrono) cuando la nueva pestaña llama a `.channel(...)`,
  // Realtime devuelve el MISMO objeto de canal ya suscrito, y añadirle un
  // nuevo `.on("postgres_changes", ...)` lanza "cannot add postgres_changes
  // callbacks ... after subscribe()" — una excepción no capturada que
  // tumba toda la página.
  const idInstancia = useId();

  // Callbacks en refs: cambian de identidad en cada render pero no deben
  // re-suscribir el canal ni re-ejecutar la carga.
  const mapearRef = useRef(mapear);
  const incluirRef = useRef(incluir);
  const alCambiarRef = useRef(alCambiar);
  useEffect(() => {
    mapearRef.current = mapear;
    incluirRef.current = incluir;
    alCambiarRef.current = alCambiar;
  });

  const proyecta = useCallback(
    (fila: TFila): TItem => (mapearRef.current ? mapearRef.current(fila) : (fila as unknown as TItem)),
    [],
  );

  const recargar = useCallback(async () => {
    setCargando(true);
    const supabase = createClient();
    let q = supabase.from(tabla).select(select);
    // El filtro `col=eq.valor` se traduce a `.eq(col, valor)`.
    const m = /^([\w.]+)=eq\.(.+)$/.exec(filtro);
    if (m) q = q.eq(m[1], m[2]);
    if (orden) q = q.order(orden.columna, { ascending: orden.ascendente ?? false });

    const { data, error: err } = await q;
    if (err) {
      setError(err.message ? "No se pudo cargar la información" : null);
      setCargando(false);
      return;
    }
    const filas = (data ?? []) as unknown as TFila[];
    setItems(filas.filter((f) => !incluirRef.current || incluirRef.current(f)).map(proyecta));
    setError(null);
    setCargando(false);
  }, [tabla, select, filtro, orden, proyecta]);

  useEffect(() => {
    if (!activo) return;

    // Si no hubo datos del servidor, se cargan al montar. Se difiere a un
    // microtask para no llamar setState de forma síncrona en el cuerpo del
    // efecto (evita renders en cascada; regla react-hooks).
    if (!inicial) void Promise.resolve().then(recargar);

    const supabase = createClient();
    const canal = supabase
      .channel(`${tabla}:${filtro}:${idInstancia}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: tabla, filter: filtro },
        (payload: RealtimePostgresChangesPayload<TFila>) => {
          if (payload.eventType === "DELETE") {
            const viejo = payload.old as { id?: string };
            if (viejo.id) setItems((prev) => prev.filter((x) => x.id !== viejo.id));
            return;
          }
          const fila = payload.new as TFila;
          const evento = payload.eventType as "INSERT" | "UPDATE";
          alCambiarRef.current?.(fila, evento);

          if (incluirRef.current && !incluirRef.current(fila)) {
            setItems((prev) => prev.filter((x) => x.id !== fila.id));
            return;
          }
          const item = proyecta(fila);
          setItems((prev) => {
            const i = prev.findIndex((x) => x.id === fila.id);
            if (i === -1) return [item, ...prev];
            const copia = prev.slice();
            copia[i] = item;
            return copia;
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
    // `recargar` ya depende de tabla/select/filtro/orden.
  }, [tabla, filtro, activo, inicial, recargar, proyecta, idInstancia]);

  return { items, setItems, recargar, cargando, error };
}
