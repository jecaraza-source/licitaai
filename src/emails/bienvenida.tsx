import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export function BienvenidaEmail({ nombre }: { nombre: string }) {
  return (
    <Html>
      <Head />
      <Preview>Bienvenido a LicitaAI</Preview>
      <Body style={{ fontFamily: "Calibri, Arial, sans-serif", backgroundColor: "#f5f5f5" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ color: "#8c2131" }}>Bienvenido a LicitaAI, {nombre}</Heading>
          <Text>
            Tu cuenta fue creada exitosamente. Ya puedes empezar a registrar licitaciones y
            dejar que la IA te ayude a analizar bases, generar propuestas y auditar tu
            documentación.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default BienvenidaEmail;
