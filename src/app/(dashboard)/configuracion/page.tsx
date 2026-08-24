import { Settings } from "lucide-react";
import { ConfiguracionEmpresa } from "@/components/configuracion/configuracion-empresa";
import { StaffJerarquiaCard } from "@/components/configuracion/staff-jerarquia-card";

export default function ConfiguracionPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Settings className="size-5 text-primary" />
        Configuración
      </h1>
      <ConfiguracionEmpresa />
      <StaffJerarquiaCard />
    </div>
  );
}
