"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { RequisitoTecnico } from "@/types";

const CUMPLE_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  si: "Cumple",
  no: "No cumple",
};

function cumpleValue(cumple: boolean | null): string {
  if (cumple === true) return "si";
  if (cumple === false) return "no";
  return "pendiente";
}

export function RequisitosTecnicosCard({ licitacionId }: { licitacionId: string }) {
  const [items, setItems] = useState<RequisitoTecnico[] | null>(null);
  const [documentos, setDocumentos] = useState<{ id: string; nombre: string }[]>([]);
  const [nuevo, setNuevo] = useState("");

  function cargar() {
    fetch(`/api/licitaciones/${licitacionId}/requisitos-tecnicos`)
      .then((res) => res.json())
      .then((json) => setItems(json.data ?? []));
  }

  useEffect(() => {
    cargar();
    const supabase = createClient();
    supabase
      .from("documentos")
      .select("id, nombre")
      .eq("licitacion_id", licitacionId)
      .then(({ data }) => setDocumentos(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacionId]);

  async function actualizar(id: string, patch: Record<string, unknown>) {
    setItems((prev) => (prev ? prev.map((i) => (i.id === id ? { ...i, ...patch } : i)) : prev));
    const res = await fetch(`/api/requisitos-tecnicos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      toast.error("No se pudo guardar el cambio");
      cargar();
    }
  }

  async function eliminar(id: string) {
    setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    await fetch(`/api/requisitos-tecnicos/${id}`, { method: "DELETE" });
  }

  async function agregar() {
    if (!nuevo.trim()) return;
    const res = await fetch(`/api/licitaciones/${licitacionId}/requisitos-tecnicos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requisito: nuevo.trim() }),
    });
    if (!res.ok) {
      toast.error("No se pudo agregar el requisito");
      return;
    }
    const json = await res.json();
    setItems((prev) => [...(prev ?? []), json.data]);
    setNuevo("");
  }

  if (items === null) {
    return <Skeleton className="h-64 w-full" />;
  }

  const cumplidos = items.filter((i) => i.cumple === true).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">Matriz de cumplimiento técnico</CardTitle>
        <span className="text-xs text-muted-foreground">
          {cumplidos}/{items.length} acreditados
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay especificaciones técnicas. Se generan automáticamente al analizar las bases
            con IA, o agrégalas manualmente abajo.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id} className="flex flex-col gap-2 rounded-lg border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.requisito}</p>
                    {!item.obligatorio && (
                      <span className="text-xs text-muted-foreground">Opcional</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Select
                      value={cumpleValue(item.cumple)}
                      onValueChange={(v) =>
                        actualizar(item.id, { cumple: v === "pendiente" ? null : v === "si" })
                      }
                    >
                      <SelectTrigger
                        size="sm"
                        className={cn(
                          "w-32",
                          item.cumple === true && "border-emerald-500/50 text-emerald-600",
                          item.cumple === false && "border-destructive/50 text-destructive",
                        )}
                      >
                        <SelectValue>
                          {(v: string | null) => (v ? CUMPLE_LABELS[v] : "")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CUMPLE_LABELS).map(([v, label]) => (
                          <SelectItem key={v} value={v}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon-sm" onClick={() => eliminar(item.id)}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Cómo cumple</label>
                    <Textarea
                      value={item.como_cumple ?? ""}
                      onChange={(e) => actualizar(item.id, { como_cumple: e.target.value })}
                      placeholder="Describe la característica ofrecida"
                      className="min-h-16 resize-none text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Evidencia</label>
                      <Input
                        value={item.evidencia ?? ""}
                        onChange={(e) => actualizar(item.id, { evidencia: e.target.value })}
                        placeholder="Ficha técnica, carta de fabricante, CV…"
                        className="text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-muted-foreground">Documento/página</label>
                      <Select
                        value={item.documento_id ?? "__ninguno__"}
                        onValueChange={(v) =>
                          actualizar(item.id, { documento_id: v === "__ninguno__" ? null : v })
                        }
                      >
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue>
                            {(v: string | null) =>
                              !v || v === "__ninguno__"
                                ? "Sin vincular"
                                : (documentos.find((d) => d.id === v)?.nombre ?? "Sin vincular")
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__ninguno__">Sin vincular</SelectItem>
                          {documentos.map((d) => (
                            <SelectItem key={d.id} value={d.id}>
                              {d.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            placeholder="Agregar requisito técnico manualmente"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                agregar();
              }
            }}
          />
          <Button variant="outline" size="icon" onClick={agregar}>
            <Plus />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
