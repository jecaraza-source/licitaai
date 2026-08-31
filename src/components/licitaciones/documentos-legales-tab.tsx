"use client";

import Link from "next/link";
import { CircleCheck, Download, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDocumentosLegalesTab } from "@/hooks/use-documentos-legales-tab";

export function DocumentosLegalesTab({ licitacionId }: { licitacionId: string }) {
  const {
    documentos,
    descargando,
    convocanteNombre,
    setConvocanteNombre,
    convocanteCargo,
    setConvocanteCargo,
    guardandoConvocante,
    regenerando,
    handleGuardarConvocante,
    handleDescargar,
    handleDescargarAnexoA,
    handleGenerarTodos,
  } = useDocumentosLegalesTab(licitacionId);

  if (documentos === null) {
    return <Skeleton className="h-96 w-full" />;
  }

  const listosCount = documentos.filter((d) => d.listo).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Documentos legales generados a partir de los datos de la empresa en Configuración y de
          esta licitación. Revisa cada documento antes de firmarlo.
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={regenerando || listosCount === 0}
          onClick={handleGenerarTodos}
          className="shrink-0"
        >
          <RefreshCw className={cn("size-3.5", regenerando && "animate-spin")} />
          {regenerando
            ? "Generando…"
            : `Generar documentos listos (${listosCount}/${documentos.length})`}
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Datos de la convocante (solo para el Anexo &quot;H&quot; - Compromisos con la
            Transparencia)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Esta sección es de la <strong>dependencia o entidad que licita</strong> (cambia en cada
            licitación), no de tu empresa. El representante legal de tu empresa se captura una sola
            vez en{" "}
            <Link href="/configuracion" className="underline">
              Configuración
            </Link>
            .
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="convocante_representante_nombre">
                Nombre de quien firma por la convocante (dependencia/entidad)
              </Label>
              <Input
                id="convocante_representante_nombre"
                value={convocanteNombre}
                onChange={(e) => setConvocanteNombre(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="convocante_representante_cargo">Cargo (en la convocante)</Label>
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
