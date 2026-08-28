"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ReferenciaLegalFuente } from "@/types";

export function PreguntasIaCard() {
  const [pregunta, setPregunta] = useState("");
  const [preguntando, setPreguntando] = useState(false);
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [fuentes, setFuentes] = useState<ReferenciaLegalFuente[]>([]);

  async function preguntar() {
    if (!pregunta.trim()) return;
    setPreguntando(true);
    setRespuesta(null);
    setFuentes([]);

    try {
      const res = await fetch("/api/referencias-legales/preguntar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta }),
      });

      let json: {
        data?: { respuesta: string; fuentes?: ReferenciaLegalFuente[] };
        error?: { message?: string };
      };
      try {
        json = await res.json();
      } catch {
        throw new Error(`El servidor respondió sin datos válidos (HTTP ${res.status})`);
      }

      if (!res.ok) {
        toast.error("No se pudo obtener respuesta", { description: json.error?.message });
        return;
      }
      setRespuesta(json.data?.respuesta ?? "");
      setFuentes(json.data?.fuentes ?? []);
    } catch (error) {
      toast.error("No se pudo obtener respuesta", {
        description: error instanceof Error ? error.message : "Error de red inesperado",
      });
    } finally {
      setPreguntando(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preguntas con IA</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-xs text-muted-foreground">
          Pregunta en lenguaje natural sobre el marco legal de licitaciones. La respuesta se
          genera únicamente a partir del texto cargado en el catálogo y cita la ley y el artículo
          de donde proviene — no sustituye asesoría legal.
        </p>
        <Textarea
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          placeholder='Ej. "¿Qué garantías puede exigir la convocante en un contrato de adquisiciones?"'
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) preguntar();
          }}
        />
        <Button onClick={preguntar} disabled={preguntando || !pregunta.trim()} className="self-start">
          <Sparkles className="size-4" />
          {preguntando ? "Consultando…" : "Preguntar con IA"}
        </Button>

        {respuesta && (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
            <p className="text-sm whitespace-pre-wrap">{respuesta}</p>

            {fuentes.length > 0 && (
              <div className="flex flex-col gap-2 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground">Fuentes citadas</p>
                <ul className="flex flex-col gap-2">
                  {fuentes.map((f) => (
                    <li key={f.indice} className="flex flex-col gap-0.5 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[11px]">
                          Fuente {f.indice}
                        </Badge>
                        <span className="font-medium">{f.ley}</span>
                        {f.articulo && <span className="text-muted-foreground">· {f.articulo}</span>}
                        {f.url_oficial && (
                          <a
                            href={f.url_oficial}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            Ver fuente <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                      <p className="text-muted-foreground">&ldquo;{f.extracto}…&rdquo;</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <p className="text-center text-[11px] text-muted-foreground">
          Powered by Anthropic &amp; OpenAI
        </p>
      </CardContent>
    </Card>
  );
}
