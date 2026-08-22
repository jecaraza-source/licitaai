import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LicitacionForm } from "@/components/licitaciones/licitacion-form";

export default function NuevaLicitacionPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nueva licitación</h1>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Datos generales</CardTitle>
        </CardHeader>
        <CardContent>
          <LicitacionForm />
        </CardContent>
      </Card>
    </div>
  );
}
