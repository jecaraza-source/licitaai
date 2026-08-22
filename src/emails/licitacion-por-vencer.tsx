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

export function LicitacionPorVencerEmail({
  titulo,
  numeroExpediente,
  diasRestantes,
  url,
}: {
  titulo: string;
  numeroExpediente: string;
  diasRestantes: number;
  url: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>{`${titulo} vence en ${diasRestantes} días`}</Preview>
      <Body style={{ fontFamily: "Calibri, Arial, sans-serif", backgroundColor: "#f5f5f5" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ color: "#8c2131" }}>Licitación próxima a vencer</Heading>
          <Text>
            La licitación <strong>{numeroExpediente} — {titulo}</strong> vence en{" "}
            <strong>{diasRestantes} días</strong>.
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
            Ver licitación
          </Button>
        </Container>
      </Body>
    </Html>
  );
}

export default LicitacionPorVencerEmail;
