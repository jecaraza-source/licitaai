"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { ErrorCarga } from "@/components/layout/error-carga";

interface Estado {
  estado: "operativo" | "degradado" | "incidente" | "desconocido";
  // La API responde solo `{ estado: "desconocido" }` cuando no está configurada.
  servicios?: Array<{ nombre: string; estado: "operativo" | "degradado" | "caido" }>;
  ts?: string;
}

const ICONO = {
  operativo: <CheckCircle2 className="size-4 text-green-600" />,
  degradado: <AlertTriangle className="size-4 text-amber-500" />,
  caido: <XCircle className="size-4 text-destructive" />,
};
const RESUMEN: Record<string, string> = {
  operativo: "Todos los sistemas operativos",
  degradado: "Rendimiento degradado en algunos servicios",
  incidente: "Incidente en curso",
  desconocido: "Estado no disponible",
};

export default function EstadoPage() {
  const [e, setE] = useState<Estado | null>(null);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    // Se conserva el último estado conocido si una actualización falla; sin
    // ninguno, la página avisa en vez de quedarse en "Cargando…".
    const cargar = () =>
      fetch("/api/estado")
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.json();
        })
        .then((json) => {
          setE(json);
          setError(false);
        })
        .catch(() => setError(true));
    cargar();
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, [intento]);

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">Estado de LicitaAI</h1>
      {error && (
        <div className="mt-4">
          <ErrorCarga
            mensaje={
              e
                ? "No se pudo actualizar el estado; se muestra el último que se obtuvo."
                : "No se pudo consultar el estado en este momento."
            }
            onReintentar={() => setIntento((n) => n + 1)}
          />
        </div>
      )}
      {!e ? (
        !error && <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 text-sm">
            {ICONO[e.estado === "incidente" ? "caido" : e.estado === "desconocido" ? "degradado" : e.estado]}
            <span className="font-medium">{RESUMEN[e.estado]}</span>
          </div>
          <ul className="mt-6 divide-y rounded-lg border">
            {(e.servicios ?? []).map((s) => (
              <li key={s.nombre} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{s.nombre}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {ICONO[s.estado]}
                  {s.estado === "operativo" ? "Operativo" : s.estado === "degradado" ? "Degradado" : "Caído"}
                </span>
              </li>
            ))}
          </ul>
          {e.ts && (
            <p className="mt-4 text-xs text-muted-foreground">
              Actualizado {new Date(e.ts).toLocaleString()}
            </p>
          )}
        </>
      )}
    </div>
  );
}
