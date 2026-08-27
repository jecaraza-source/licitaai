"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface Estado {
  estado: "operativo" | "degradado" | "incidente" | "desconocido";
  servicios: Array<{ nombre: string; estado: "operativo" | "degradado" | "caido" }>;
  ts: string;
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

  useEffect(() => {
    const cargar = () => fetch("/api/estado").then((r) => r.json()).then(setE).catch(() => {});
    cargar();
    const t = setInterval(cargar, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="mx-auto max-w-lg p-8">
      <h1 className="text-xl font-semibold">Estado de LicitaAI</h1>
      {!e ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-2 text-sm">
            {ICONO[e.estado === "incidente" ? "caido" : e.estado === "desconocido" ? "degradado" : e.estado]}
            <span className="font-medium">{RESUMEN[e.estado]}</span>
          </div>
          <ul className="mt-6 divide-y rounded-lg border">
            {e.servicios.map((s) => (
              <li key={s.nombre} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>{s.nombre}</span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {ICONO[s.estado]}
                  {s.estado === "operativo" ? "Operativo" : s.estado === "degradado" ? "Degradado" : "Caído"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Actualizado {new Date(e.ts).toLocaleString()}
          </p>
        </>
      )}
    </div>
  );
}
