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

const ROL_LABELS: Record<string, string> = {
  EJECUTOR: "Ejecutor",
  INTEGRADOR: "Integrador",
  SUPERVISOR: "Supervisor",
};

export function InvitacionStaffEmail({
  organizacionNombre,
  rolJerarquico,
  url,
}: {
  organizacionNombre: string;
  rolJerarquico: string;
  url: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Te invitaron a unirte a {organizacionNombre} en LicitaAI</Preview>
      <Body style={{ fontFamily: "Calibri, Arial, sans-serif", backgroundColor: "#f5f5f5" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", borderRadius: "8px" }}>
          <Heading style={{ color: "#8c2131" }}>Te invitaron a LicitaAI</Heading>
          <Text>
            <strong>{organizacionNombre}</strong> te invitó a unirte como{" "}
            <strong>{ROL_LABELS[rolJerarquico] ?? rolJerarquico}</strong> dentro de su cadena de
            autorización de licitaciones.
          </Text>
          <Button
            href={url}
            style={{
              backgroundColor: "#8c2131",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "6px",
              textDecoration: "none",
            }}
          >
            Crear mi cuenta
          </Button>
          <Text style={{ color: "#666666", fontSize: "12px" }}>
            Este enlace vence en 7 días. Si no esperabas esta invitación, puedes ignorar este
            correo.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default InvitacionStaffEmail;
