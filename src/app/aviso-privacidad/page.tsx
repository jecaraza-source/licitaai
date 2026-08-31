import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AvisoPrivacidadPage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Aviso de privacidad</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            LicitaAI procesa los datos que tu organización captura o sube a la
            plataforma (perfil de la empresa, documentos de licitaciones,
            expedientes y propuestas) para prestar el servicio: análisis de
            bases, generación de propuestas, seguimiento y auditoría
            documental asistidos por IA.
          </p>

          <div className="space-y-1.5">
            <h2 className="font-medium text-foreground">Qué datos tratamos</h2>
            <p>
              Datos de identificación de las personas usuarias (nombre,
              correo) y los datos de negocio de tu organización: perfil de
              empresa, documentos corporativos y de licitaciones, y el
              contenido que generan los análisis de IA a partir de ellos.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-medium text-foreground">Con quién lo compartimos</h2>
            <p>
              El contenido de los documentos que subes se envía a proveedores
              de IA (Anthropic y OpenAI) para su análisis, extracción y
              generación de texto. No compartimos propuestas económicas ni
              llaves o certificados de firma con esos proveedores. No
              vendemos datos a terceros.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-medium text-foreground">Aislamiento y seguridad</h2>
            <p>
              Los datos de cada organización están aislados de las demás a
              nivel de base de datos. Las acciones sensibles quedan
              registradas en una bitácora de auditoría inalterable.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-medium text-foreground">Retención</h2>
            <p>
              Conservamos los datos de tu organización mientras la cuenta esté
              activa. Los datos operativos y de costo se conservan por
              periodos acotados definidos por obligaciones fiscales y de
              auditoría; después se archivan o se eliminan.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-medium text-foreground">Tus derechos</h2>
            <p>
              Puedes solicitar la exportación o el borrado de los datos de tu
              organización desde Configuración, o contactando a quien
              administre tu cuenta en LicitaAI.
            </p>
          </div>

          <p className="text-xs">
            Este aviso describe cómo tratamos los datos dentro de la
            plataforma; no sustituye el análisis legal de tu organización
            sobre el cumplimiento de sus propias obligaciones de protección
            de datos.
          </p>

          <Link href="/" className="inline-block font-medium text-foreground underline">
            Volver
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
