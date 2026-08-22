import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ConfiguracionPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Perfil de empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            La edición del perfil de empresa (razón social, RFC, logo, certificaciones) se
            construye en el Sprint 5.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
