"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { EjeViabilidad, RespuestaViabilidad } from "@/types";

const EJES: { eje: EjeViabilidad; label: string; pregunta: string }[] = [
  { eje: "JURIDICO", label: "Jurídico-administrativo", pregunta: "¿La empresa puede participar?" },
  { eje: "TECNICO", label: "Técnico", pregunta: "¿Puede cumplir el 100% de las especificaciones obligatorias?" },
  { eje: "EXPERIENCIA", label: "Experiencia", pregunta: "¿Puede acreditarla documentalmente?" },
  { eje: "PERSONAL", label: "Personal", pregunta: "¿Cuenta con los perfiles requeridos?" },
  { eje: "CERTIFICACIONES", label: "Certificaciones", pregunta: "¿Se tienen vigentes?" },
  { eje: "COMERCIAL", label: "Comercial", pregunta: "¿Puede obtener los productos/servicios?" },
  { eje: "LOGISTICO", label: "Logístico", pregunta: "¿Puede cumplir lugares y tiempos?" },
  { eje: "FINANCIERO", label: "Financiero", pregunta: "¿Puede soportar garantías, financiamiento y condiciones de pago?" },
  { eje: "ECONOMICO", label: "Económico", pregunta: "¿Puede presentar un precio competitivo y sostenible?" },
];

const RESPUESTA_LABELS: Record<string, string> = { SI: "Sí", PARCIAL: "Parcial", NO: "No" };

interface ViabilidadData {
  respuestas_json: RespuestaViabilidad[];
  decision: "GO" | "NO_GO" | null;
  decidido_at: string | null;
}

export function ViabilidadTab({ licitacionId }: { licitacionId: string }) {
  const [data, setData] = useState<ViabilidadData | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetch(`/api/licitaciones/${licitacionId}/viabilidad`)
      .then((res) => res.json())
      .then((json) => setData(json.data));
  }, [licitacionId]);

  function actualizarRespuesta(eje: EjeViabilidad, patch: Partial<RespuestaViabilidad>) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            respuestas_json: prev.respuestas_json.map((r) =>
              r.eje === eje ? { ...r, ...patch } : r,
            ),
          }
        : prev,
    );
  }

  async function guardar(decision?: "GO" | "NO_GO") {
    if (!data) return;
    setGuardando(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}/viabilidad`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        respuestas_json: data.respuestas_json,
        decision: decision ?? data.decision,
      }),
    });
    setGuardando(false);
    if (!res.ok) {
      toast.error("No se pudo guardar la viabilidad");
      return;
    }
    const json = await res.json();
    setData((prev) => (prev ? { ...prev, decision: json.data.decision, decidido_at: json.data.decidido_at } : prev));
    toast.success(decision ? `Decisión registrada: ${decision === "GO" ? "Go" : "No-Go"}` : "Guardado");
  }

  if (!data) {
    return <Skeleton className="h-96 w-full" />;
  }

  const conNo = data.respuestas_json.filter((r) => r.respuesta === "NO");

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Antes de invertir recursos en elaborar la propuesta, evalúa si la empresa puede participar
        en los 9 ejes del proceso operativo. Cualquier eje en &quot;No&quot; debe escalarse antes de
        continuar.
      </p>

      {conNo.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
          <p>
            {conNo.length} eje(s) marcados como &quot;No&quot; — resuélvelos o decide No-Go antes de
            avanzar con la propuesta.
          </p>
        </div>
      )}

      {data.decision && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3 text-sm font-medium",
            data.decision === "GO"
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700"
              : "border-destructive/40 bg-destructive/5 text-destructive",
          )}
        >
          {data.decision === "GO" ? (
            <CircleCheck className="size-4" />
          ) : (
            <CircleX className="size-4" />
          )}
          Decisión registrada: {data.decision === "GO" ? "Go — participar" : "No-Go — no participar"}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {EJES.map(({ eje, label, pregunta }) => {
          const respuesta = data.respuestas_json.find((r) => r.eje === eje);
          return (
            <Card key={eje}>
              <CardContent className="flex flex-col gap-2 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{pregunta}</p>
                  </div>
                  <Select
                    value={respuesta?.respuesta ?? "__sin_responder__"}
                    onValueChange={(v) =>
                      actualizarRespuesta(eje, {
                        respuesta: v === "__sin_responder__" ? null : (v as "SI" | "PARCIAL" | "NO"),
                      })
                    }
                  >
                    <SelectTrigger
                      size="sm"
                      className={cn(
                        "w-28",
                        respuesta?.respuesta === "NO" && "border-destructive/50 text-destructive",
                        respuesta?.respuesta === "SI" && "border-emerald-500/50 text-emerald-600",
                      )}
                    >
                      <SelectValue>
                        {(v: string | null) =>
                          !v || v === "__sin_responder__" ? "Sin responder" : RESPUESTA_LABELS[v]
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__sin_responder__">Sin responder</SelectItem>
                      {Object.entries(RESPUESTA_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={respuesta?.comentario ?? ""}
                  onChange={(e) => actualizarRespuesta(eje, { comentario: e.target.value })}
                  placeholder="Comentario (opcional)"
                  className="min-h-14 resize-none text-sm"
                />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => guardar()} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar respuestas"}
        </Button>
        <Button
          variant="outline"
          className="border-destructive/40 text-destructive hover:bg-destructive/5"
          onClick={() => guardar("NO_GO")}
          disabled={guardando}
        >
          Decidir No-Go
        </Button>
        <Button onClick={() => guardar("GO")} disabled={guardando}>
          Decidir Go
        </Button>
      </div>
    </div>
  );
}
