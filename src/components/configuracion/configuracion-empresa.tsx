"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmpresaPerfilForm } from "@/components/configuracion/empresa-perfil-form";
import { DocumentosCorporativosCard } from "@/components/configuracion/documentos-corporativos-card";

export function ConfiguracionEmpresa() {
  const [empresaId, setEmpresaId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle>Perfil de empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <EmpresaPerfilForm onEmpresaChange={setEmpresaId} />
        </CardContent>
      </Card>

      {empresaId ? (
        <DocumentosCorporativosCard empresaId={empresaId} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Documentos corporativos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Guarda el perfil de la empresa para gestionar sus documentos.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
