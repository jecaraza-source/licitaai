"use client";

import Link from "next/link";
import { CircleCheck, Download, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentosTecnicosTab } from "@/hooks/use-documentos-tecnicos-tab";

export function DocumentosTecnicosTab({ licitacionId }: { licitacionId: string }) {
  const { documentos, descargando, handleDescargar } = useDocumentosTecnicosTab(licitacionId);

  if (documentos === null) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Cartas y manifestaciones técnicas generadas a partir de los datos de capacidad técnica de la
        empresa en Configuración y de esta licitación. No sustituyen el Anexo Técnico ni la propuesta
        técnica, que se elaboran en la pestaña <strong>Propuesta Técnica</strong>. Revisa cada
        documento antes de firmarlo.
      </p>

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
              {!doc.listo && (
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
      </div>
    </div>
  );
}
