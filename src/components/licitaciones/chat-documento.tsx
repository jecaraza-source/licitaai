"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface Mensaje {
  pregunta: string;
  respuesta: string;
  referencias: { indice: number; extracto: string }[];
}

export function ChatDocumento({ licitacionId }: { licitacionId: string }) {
  const [pregunta, setPregunta] = useState("");
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [loading, setLoading] = useState(false);

  async function handleEnviar() {
    const texto = pregunta.trim();
    if (!texto || loading) return;

    setLoading(true);
    setPregunta("");

    const res = await fetch(`/api/licitaciones/${licitacionId}/preguntar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta: texto }),
    });
    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      toast.error("No se pudo obtener respuesta", { description: json.error });
      return;
    }

    setMensajes((prev) => [
      ...prev,
      { pregunta: texto, respuesta: json.data.respuesta, referencias: json.data.referencias },
    ]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pregúntale al documento</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {mensajes.length > 0 && (
          <div className="flex max-h-96 flex-col gap-4 overflow-y-auto">
            {mensajes.map((m, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                  {m.pregunta}
                </div>
                <div className="self-start rounded-lg bg-muted px-3 py-2 text-sm">
                  <p className="whitespace-pre-wrap">{m.respuesta}</p>
                  {m.referencias.length > 0 && (
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        {m.referencias.length} fragmento{m.referencias.length === 1 ? "" : "s"} de
                        referencia
                      </summary>
                      <ul className="mt-1 flex flex-col gap-1">
                        {m.referencias.map((r) => (
                          <li key={r.indice}>
                            [{r.indice}] {r.extracto}…
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleEnviar();
              }
            }}
            placeholder="Pregunta algo sobre las bases de esta licitación…"
            className="min-h-16 resize-none"
          />
          <Button onClick={handleEnviar} disabled={loading || !pregunta.trim()}>
            <Send />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
