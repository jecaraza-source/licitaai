import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Este aviso debe coincidir con lo que el código realmente envía a los
// proveedores de IA. El inventario está en docs/p2/21-flujo-de-datos-ia.md:
// si cambia qué funciones llaman a Anthropic u OpenAI, o qué contenido
// mandan, hay que actualizar también este texto.
const ULTIMA_ACTUALIZACION = "23 de octubre de 2026";

export default function AvisoPrivacidadPage() {
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Aviso de privacidad</CardTitle>
          <p className="text-xs text-muted-foreground">
            Última actualización: {ULTIMA_ACTUALIZACION}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            LicitaAI es una plataforma de apoyo para participar en procedimientos
            de contratación pública. <strong className="text-foreground">Utiliza
            inteligencia artificial (IA)</strong> para analizar bases, auditar
            documentos y expedientes, y generar borradores de propuestas. Para
            ello procesa los datos que tu organización captura o sube a la
            plataforma: perfil de la empresa, documentos de licitaciones,
            expedientes y propuestas.
          </p>

          <div className="space-y-1.5">
            <h2 className="font-medium text-foreground">Qué datos tratamos</h2>
            <p>
              Datos de identificación de las personas usuarias (nombre, correo)
              y los datos de negocio de tu organización: perfil de empresa,
              documentos corporativos y de licitaciones, y el contenido que
              generan los análisis de IA a partir de ellos. Los documentos que
              subes pueden contener datos personales, por ejemplo
              identificaciones oficiales, poderes notariales, comprobantes de
              domicilio y los nombres de representantes legales.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-medium text-foreground">Cómo usamos la inteligencia artificial</h2>
            <p>
              La IA se usa para leer y extraer información de documentos,
              analizar las bases de una licitación, verificar documentos y
              expedientes, redactar borradores de propuestas y de preguntas para
              la junta de aclaraciones, analizar partidas y precios, y responder
              preguntas sobre tus documentos y sobre leyes y reglamentos.
            </p>
            <p>
              Los resultados de la IA son borradores y pueden contener errores:
              una persona debe revisarlos antes de usarlos o presentarlos. La
              IA no declara el cumplimiento legal de un documento ni de una
              propuesta.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="font-medium text-foreground">Con quién lo compartimos</h2>
            <p>
              Para ofrecer estas funciones enviamos contenido a dos proveedores
              de IA: <strong className="text-foreground">Anthropic</strong>{" "}
              (modelos Claude, para lectura, análisis y redacción) y{" "}
              <strong className="text-foreground">OpenAI</strong> (para crear un
              índice de búsqueda con el texto de los documentos y encontrar los
              fragmentos relevantes). Según la función que uses, se envía:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                El contenido de los documentos que subes: su texto y, cuando el
                archivo es un PDF escaneado o un documento que se analiza o
                audita con IA (incluidos los documentos corporativos como
                identificaciones, actas y poderes), el archivo completo.
              </li>
              <li>
                Datos del perfil de la empresa que se usan para verificar
                documentos y redactar propuestas: razón social, RFC,
                representante legal, giro, experiencia, certificaciones y
                clientes de referencia.
              </li>
              <li>
                Las partidas de la propuesta económica, incluidos los precios
                ofertados, cuando usas el análisis de competitividad, la
                auditoría del expediente o el estudio de mercado.
              </li>
              <li>
                Los textos que redactas para mejorarlos con IA y las preguntas
                que haces a las funciones de consulta.
              </li>
              <li>
                En el estudio de mercado, la descripción, la unidad y la
                cantidad de cada partida; el proveedor puede realizar búsquedas
                en internet con esa información.
              </li>
            </ul>
            <p>
              No enviamos a esos proveedores contraseñas, ni las llaves o los
              certificados de tu firma electrónica: la firma se realiza en tu
              navegador. No vendemos datos a terceros.
            </p>
            <p>
              De acuerdo con las condiciones de uso de su API, ninguno de los
              dos proveedores utiliza estos datos para entrenar sus modelos por
              defecto, y pueden conservar registros por periodos limitados con
              fines de seguridad (según OpenAI, hasta 30 días). Estos
              proveedores pueden procesar los datos fuera de México. Tú decides
              qué subes: si cierta información no debe procesarse con IA, no la
              subas ni uses la función correspondiente.
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
