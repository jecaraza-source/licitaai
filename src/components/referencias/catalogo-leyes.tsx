"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AmbitoReferenciaLegal, ReferenciaLegal, ReferenciaLegalResultadoBusqueda } from "@/types";

const AMBITO_LABELS: Record<AmbitoReferenciaLegal, string> = {
  FEDERAL: "Federal",
  EDOMEX: "Estado de México",
  CDMX: "Ciudad de México",
  GENERAL: "General",
};

const AMBITO_BADGE: Record<AmbitoReferenciaLegal, string> = {
  FEDERAL: "bg-primary/10 text-primary",
  EDOMEX: "bg-secondary text-secondary-foreground",
  CDMX: "bg-accent text-accent-foreground",
  GENERAL: "bg-muted text-muted-foreground",
};

export function CatalogoLeyes() {
  const [leyes, setLeyes] = useState<ReferenciaLegal[] | null>(null);
  const [query, setQuery] = useState("");
  const [ambito, setAmbito] = useState<AmbitoReferenciaLegal | "__todos__">("__todos__");
  const [resultados, setResultados] = useState<ReferenciaLegalResultadoBusqueda[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const buscarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/referencias-legales")
      .then((res) => res.json())
      .then((json) => setLeyes(json.data ?? []));
  }, []);

  function onQueryChange(next: string) {
    setQuery(next);
    if (buscarTimeout.current) clearTimeout(buscarTimeout.current);

    const q = next.trim();
    if (!q) return;
    setBuscando(true);
    buscarTimeout.current = setTimeout(() => {
      fetch(`/api/referencias-legales/buscar?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((json) => setResultados(json.data ?? []))
        .finally(() => setBuscando(false));
    }, 350);
  }

  const leyesFiltradas = useMemo(() => {
    if (!leyes) return null;
    if (ambito === "__todos__") return leyes;
    return leyes.filter((l) => l.ambito === ambito);
  }, [leyes, ambito]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catálogo de leyes y reglamentos</CardTitle>
        {leyes && (
          <p className="text-sm text-muted-foreground">
            {leyes.length} referencia{leyes.length === 1 ? "" : "s"} disponible
            {leyes.length === 1 ? "" : "s"}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Buscar por palabra, tema o artículo…"
              className="h-11 pl-10"
            />
          </div>
          <Select value={ambito} onValueChange={(v) => v && setAmbito(v as typeof ambito)}>
            <SelectTrigger className="h-11 w-full sm:w-44">
              <SelectValue>
                {() => (ambito === "__todos__" ? "Todos los ámbitos" : AMBITO_LABELS[ambito])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__todos__">Todos los ámbitos</SelectItem>
              {(Object.keys(AMBITO_LABELS) as AmbitoReferenciaLegal[]).map((a) => (
                <SelectItem key={a} value={a}>
                  {AMBITO_LABELS[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {query.trim() ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              {buscando ? "Buscando…" : `${resultados?.length ?? 0} resultado(s)`}
            </p>
            {resultados !== null && !buscando && resultados.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin coincidencias. Prueba con otro término, o usa &ldquo;Preguntar con IA&rdquo; abajo.
              </p>
            )}
            <ul className="flex flex-col gap-2">
              {resultados?.map((r) => (
                <li
                  key={r.chunk_id}
                  className="flex flex-col gap-1 rounded-lg border p-3 transition-colors hover:bg-secondary/40"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium">{r.referencia_nombre}</span>
                    {r.articulo && (
                      <Badge variant="outline" className="text-[11px]">
                        {r.articulo}
                      </Badge>
                    )}
                  </div>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{r.contenido}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {leyesFiltradas === null ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : leyesFiltradas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin leyes en este ámbito.</p>
            ) : (
              leyesFiltradas.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-col gap-1.5 rounded-lg border p-3 transition-colors hover:bg-secondary/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{l.nombre}</p>
                      <p className="text-xs text-muted-foreground">{l.nombre_completo}</p>
                    </div>
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        l.con_contenido ? "bg-emerald-500" : "bg-muted-foreground/30",
                      )}
                      title={l.con_contenido ? "Texto cargado" : "Sin texto cargado"}
                    />
                  </div>
                  {l.descripcion && (
                    <p className="text-xs text-muted-foreground">{l.descripcion}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[11px]">
                      {l.tipo === "LEY"
                        ? "Ley"
                        : l.tipo === "REGLAMENTO"
                          ? "Reglamento"
                          : l.tipo === "LINEAMIENTO"
                            ? "Lineamiento"
                            : "Código"}
                    </Badge>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", AMBITO_BADGE[l.ambito])}>
                      {AMBITO_LABELS[l.ambito]}
                    </span>
                    {l.url_oficial && (
                      <a
                        href={l.url_oficial}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Fuente oficial <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </li>
              ))
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
