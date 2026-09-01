"use client";

import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmpresaPerfilForm } from "@/components/configuracion/empresa-perfil-form";
import { DocumentosCorporativosCard } from "@/components/configuracion/documentos-corporativos-card";
import { useEmpresaPerfilForm } from "@/hooks/use-empresa-perfil-form";

export function ConfiguracionEmpresa() {
  // Un solo estado de perfil de empresa para las dos tarjetas: "Perfil de
  // empresa" (datos generales y legales) y "Documentos corporativos" (que
  // incluye la pestaña "Otros datos" con certificaciones, clientes de
  // referencia y datos técnicos) — así ambas se guardan juntas con el botón
  // "Guardar perfil" sin arriesgar que una pise los cambios de la otra.
  const empresaForm = useEmpresaPerfilForm();
  const { selectedId, form, setCampo } = empresaForm;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
              <Building2 className="size-4" />
            </span>
            Perfil de empresa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <EmpresaPerfilForm empresaForm={empresaForm} />
        </CardContent>
      </Card>

      {selectedId && form ? (
        <DocumentosCorporativosCard empresaId={selectedId} form={form} setCampo={setCampo} />
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
