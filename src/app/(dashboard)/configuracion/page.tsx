import { ConfiguracionEmpresa } from "@/components/configuracion/configuracion-empresa";

export default function ConfiguracionPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
      <ConfiguracionEmpresa />
    </div>
  );
}
