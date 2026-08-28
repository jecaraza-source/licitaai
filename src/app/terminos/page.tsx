"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TERMINOS_PUNTOS, TERMINOS_VERSION } from "@/lib/terminos";

export default function TerminosPage() {
  const router = useRouter();
  const [aceptado, setAceptado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const aceptar = async () => {
    setEnviando(true);
    const res = await fetch("/api/terminos/aceptar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version: TERMINOS_VERSION }),
    });
    setEnviando(false);
    if (!res.ok) {
      toast.error("No se pudo registrar la aceptación. Intenta de nuevo.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-svh max-w-2xl items-center p-6">
      <Card>
        <CardHeader>
          <CardTitle>Términos de uso y aviso sobre la IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Antes de continuar, revisa y acepta los siguientes puntos (versión {TERMINOS_VERSION}).
          </p>
          <ul className="space-y-3">
            {TERMINOS_PUNTOS.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 pt-2">
            <Checkbox checked={aceptado} onCheckedChange={(v) => setAceptado(v === true)} />
            <span>He leído y acepto los términos de uso y el aviso sobre el uso de IA.</span>
          </label>
          <Button onClick={aceptar} disabled={!aceptado || enviando} className="w-full">
            {enviando ? "Guardando…" : "Aceptar y continuar"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
