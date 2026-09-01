import { Settings } from "lucide-react";
import { ConfiguracionEmpresa } from "@/components/configuracion/configuracion-empresa";
import { StaffJerarquiaCard } from "@/components/configuracion/staff-jerarquia-card";
import { MetricasValorCard } from "@/components/configuracion/metricas-valor-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ConfiguracionPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Gestión</p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-secondary text-primary">
            <Settings className="size-5" />
          </span>
          Configuración
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Administra el perfil de tu empresa, su staff y las métricas de valor.
        </p>
      </div>

      <Tabs defaultValue="perfil">
        <TabsList>
          <TabsTrigger value="perfil">Perfil de la empresa</TabsTrigger>
          <TabsTrigger value="staff">Staff y cadena de autorización</TabsTrigger>
        </TabsList>

        <TabsContent value="perfil" className="flex flex-col gap-6">
          <MetricasValorCard />
          <ConfiguracionEmpresa />
        </TabsContent>

        <TabsContent value="staff">
          <StaffJerarquiaCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
