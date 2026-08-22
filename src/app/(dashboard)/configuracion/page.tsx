import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmpresaPerfilForm } from "@/components/configuracion/empresa-perfil-form";

export default function ConfiguracionPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Perfil de empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <EmpresaPerfilForm />
        </CardContent>
      </Card>
    </div>
  );
}
