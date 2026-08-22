import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export function AnalisisCompletadoEmail({
  titulo,
  numeroExpediente,
  nivelConfianza,
  url,
}: {
  titulo: string;
  numeroExpediente: string;
  nivelConfianza: string;
  url: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Análisis de bases completado — {titulo}</Preview>
      <Body style={{ fontFamily: "Calibri, Arial, sans-serif", backgroundColor: "#f5f5f5" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ color: "#8c2131" }}>Análisis de bases completado</Heading>
          <Text>
            El análisis con IA de <strong>{numeroExpediente} — {titulo}</strong> terminó, con
            nivel de confianza <strong>{nivelConfianza}</strong>.
          </Text>
          <Button
            href={url}
            style={{
              backgroundColor: "#8c2131",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "6px",
            }}
          >
            Ver ficha de análisis
          </Button>
        </Container>
      </Body>
    </Html>
  );
}

export default AnalisisCompletadoEmail;
