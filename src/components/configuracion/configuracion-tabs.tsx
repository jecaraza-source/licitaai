"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmpresaPerfilForm } from "@/components/configuracion/empresa-perfil-form";
import { OtrosDatosEmpresaForm } from "@/components/configuracion/otros-datos-empresa-form";
import { DocumentosCorporativosCard } from "@/components/configuracion/documentos-corporativos-card";
import { DocumentosScoreCard } from "@/components/configuracion/documentos-score-card";
import { StaffJerarquiaCard } from "@/components/configuracion/staff-jerarquia-card";
import { MetricasValorCard } from "@/components/configuracion/metricas-valor-card";
import { ConsumoIaCard } from "@/components/configuracion/consumo-ia-card";
import { useEmpresaPerfilForm } from "@/hooks/use-empresa-perfil-form";
import {
  PESTANA_INICIAL_CONFIGURACION,
  parsePestanaConfiguracion,
  pestanasVisibles,
} from "@/lib/configuracion";

// Configuración en cuatro pestañas, una por tema: el perfil de la empresa, sus
// documentos (los que alimentan las auditorías), el staff y, solo para ADMIN y
// MANAGER, el uso de IA con el valor que genera. La pestaña activa vive en la URL
// (`?tab=documentos`) para poder enlazarla y no perder el lugar al recargar.
//
// El estado del perfil de la empresa se crea aquí, una sola vez: lo comparten el
// perfil (con "Otros datos" dentro) y la pestaña de documentos, que necesita saber
// cuál es la empresa activa aunque se cambie desde el perfil. Cada pestaña se
// desmonta al salir de ella, pero este estado se conserva.
export function ConfiguracionTabs({ veAdminManager }: { veAdminManager: boolean }) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(() => parsePestanaConfiguracion(searchParams.get("tab"), veAdminManager));
  const empresaForm = useEmpresaPerfilForm();
  const { selectedId, form, setCampo } = empresaForm;

  function irA(valor: string) {
    setTab(valor);
    const params = new URLSearchParams(searchParams.toString());
    if (valor === PESTANA_INICIAL_CONFIGURACION) params.delete("tab");
    else params.set("tab", valor);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  return (
    <Tabs value={tab} onValueChange={(v) => typeof v === "string" && irA(v)}>
      <div className="-mx-1 overflow-x-auto px-1">
        <TabsList className="w-max">
          {pestanasVisibles(veAdminManager).map((p) => (
            <TabsTrigger key={p.value} value={p.value}>
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      <TabsContent value="perfil" className="max-w-4xl">
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
            <EmpresaPerfilForm
              empresaForm={empresaForm}
              extra={form ? <OtrosDatosEmpresaForm form={form} setCampo={setCampo} /> : null}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="documentos" className="flex max-w-4xl flex-col gap-6">
        {selectedId ? (
          <>
            <DocumentosCorporativosCard empresaId={selectedId} />
            <DocumentosScoreCard empresaId={selectedId} />
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Documentos de la empresa</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {form ? "Guarda el perfil de la empresa para gestionar sus documentos." : "Cargando…"}
              </p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="staff">
        <StaffJerarquiaCard />
      </TabsContent>

      {veAdminManager && (
        <TabsContent value="ia" className="flex flex-col gap-6">
          <MetricasValorCard />
          <ConsumoIaCard />
        </TabsContent>
      )}
    </Tabs>
  );
}
