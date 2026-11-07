"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { LicitacionDeCorreo } from "@/lib/correos-compras-mx";

// Busca licitaciones de la empresa por expediente, título o institución y deja
// elegir una. Si llega una sugerida (su expediente aparece en el correo) se
// muestra arriba para elegirla de un clic.
export function BuscadorLicitacion({
  seleccionada,
  onElegir,
  sugerida,
}: {
  seleccionada: LicitacionDeCorreo | null;
  onElegir: (l: LicitacionDeCorreo) => void;
  sugerida: LicitacionDeCorreo | null;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<LicitacionDeCorreo[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    let activo = true;
    const espera = setTimeout(() => {
      fetch(`/api/licitaciones?page=1&pageSize=8&search=${encodeURIComponent(texto.trim())}`)
        .then((res) => {
          if (!res.ok) throw new Error(String(res.status));
          return res.json();
        })
        .then((json) => {
          if (!activo) return;
          setResultados(json.data?.data ?? []);
          setError(false);
        })
        .catch(() => activo && setError(true));
    }, texto ? 250 : 0);
    return () => {
      activo = false;
      clearTimeout(espera);
    };
  }, [texto]);

  const opciones = [
    ...(sugerida ? [sugerida] : []),
    ...resultados.filter((r) => r.id !== sugerida?.id),
  ];

  return (
    <div className="flex flex-col gap-2">
      <Input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por expediente, título o institución"
        aria-label="Buscar licitación"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          No se pudo buscar. Inténtalo de nuevo.
        </p>
      )}
      <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto" aria-label="Licitaciones">
        {opciones.map((l) => {
          const activa = seleccionada?.id === l.id;
          return (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => onElegir(l)}
                aria-pressed={activa}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
                  activa && "border-primary bg-secondary",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{l.numero_expediente}</span>
                  <span className="block truncate text-muted-foreground">{l.titulo}</span>
                </span>
                {l.id === sugerida?.id && (
                  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    Mencionada en el correo
                  </span>
                )}
                {activa && <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
        {opciones.length === 0 && !error && (
          <li className="px-1 py-2 text-sm text-muted-foreground">No hay licitaciones que coincidan.</li>
        )}
      </ul>
    </div>
  );
}
