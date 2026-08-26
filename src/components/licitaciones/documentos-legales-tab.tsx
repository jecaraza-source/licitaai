"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CircleCheck, Download, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { descargarBlob } from "@/lib/descargar-archivo";
import type { TipoDocumentoLegal } from "@/lib/documentos-legales";

interface DocumentoLegalEstado {
  tipo: TipoDocumentoLegal;
  titulo: string;
  listo: boolean;
  faltantes: string[];
}

export function DocumentosLegalesTab({ licitacionId }: { licitacionId: string }) {
  const [documentos, setDocumentos] = useState<DocumentoLegalEstado[] | null>(null);
  const [descargando, setDescargando] = useState<string | null>(null);
  const [convocanteNombre, setConvocanteNombre] = useState("");
  const [convocanteCargo, setConvocanteCargo] = useState("");
  const [guardandoConvocante, setGuardandoConvocante] = useState(false);

  function cargar() {
    fetch(`/api/licitaciones/${licitacionId}/documentos-legales`)
      .then((res) => res.json())
      .then((json) => {
        setDocumentos(json.data?.documentos ?? []);
        setConvocanteNombre(json.data?.convocanteRepresentanteNombre ?? "");
        setConvocanteCargo(json.data?.convocanteRepresentanteCargo ?? "");
      });
  }

  useEffect(cargar, [licitacionId]);

  async function handleGuardarConvocante() {
    setGuardandoConvocante(true);
    const res = await fetch(`/api/licitaciones/${licitacionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        convocante_representante_nombre: convocanteNombre || null,
        convocante_representante_cargo: convocanteCargo || null,
      }),
    });
    setGuardandoConvocante(false);
    if (!res.ok) {
      toast.error("No se pudo guardar");
      return;
    }
    toast.success("Datos de la convocante guardados");
    cargar();
  }

  async function handleDescargar(tipo: TipoDocumentoLegal) {
    setDescargando(tipo);
    await descargarBlob(
      `/api/licitaciones/${licitacionId}/documentos-legales/${tipo}/exportar`,
      `${tipo}.docx`,
    );
    setDescargando(null);
  }

  async function handleDescargarAnexoA() {
    setDescargando("LEG09");
    await descargarBlob(
      `/api/licitaciones/${licitacionId}/propuesta-tecnica/exportar?anexoA=1`,
      "LEG09-anexo-a.docx",
      { method: "POST" },
    );
    setDescargando(null);
  }

  if (documentos === null) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Documentos legales generados a partir de los datos de la empresa en Configuración y de esta
        licitación. Revisa cada documento antes de firmarlo.
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Datos de la convocante (para el Anexo &quot;H&quot; - Compromisos con la Transparencia)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="convocante_representante_nombre">
                Nombre de quien firma por la convocante
              </Label>
              <Input
                id="convocante_representante_nombre"
                value={convocanteNombre}
                onChange={(e) => setConvocanteNombre(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="convocante_representante_cargo">Cargo</Label>
              <Input
                id="convocante_representante_cargo"
                placeholder="Apoderado(a) Legal"
                value={convocanteCargo}
                onChange={(e) => setConvocanteCargo(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={guardandoConvocante}
              onClick={handleGuardarConvocante}
            >
              {guardandoConvocante ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {documentos.map((doc) => (
          <Card key={doc.tipo}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm font-medium">
                  {doc.tipo} — {doc.titulo}
                </CardTitle>
                {doc.listo ? (
                  <Badge variant="secondary" className="gap-1">
                    <CircleCheck className="size-3.5" /> Listo
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <TriangleAlert className="size-3.5" /> Faltan datos
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {!doc.listo && doc.tipo === "LEG15" && (
                <p className="text-xs text-muted-foreground">
                  Faltan datos: {doc.faltantes.join(", ")}. El nombre de la convocante se completa
                  arriba; los demás datos, en Configuración.
                </p>
              )}
              {!doc.listo && doc.tipo !== "LEG15" && (
                <p className="text-xs text-muted-foreground">
                  Faltan en Configuración:{" "}
                  <Link href="/configuracion" className="underline">
                    {doc.faltantes.join(", ")}
                  </Link>
                </p>
              )}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!doc.listo || descargando === doc.tipo}
                onClick={() => handleDescargar(doc.tipo)}
              >
                <Download className="size-3.5" />
                {descargando === doc.tipo ? "Generando…" : "Descargar .docx"}
              </Button>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              LEG09 — Anexo &quot;A&quot; - Especificaciones Técnicas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Este anexo es la Propuesta Técnica de la licitación. Edítala en la pestaña{" "}
              <strong>Propuesta Técnica</strong> y descárgala desde aquí con el encabezado oficial del anexo.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={descargando === "LEG09"}
              onClick={handleDescargarAnexoA}
            >
              <Download className="size-3.5" />
              {descargando === "LEG09" ? "Generando…" : 'Descargar como Anexo "A"'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
