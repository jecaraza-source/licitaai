"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

type RolPlataforma = "ADMIN" | "OPERADOR";

interface PlatformAdmin {
  id: string;
  email: string;
  nombre: string;
  rol: RolPlataforma;
  created_at: string;
}

const ROL_LABEL: Record<RolPlataforma, string> = { ADMIN: "Admin", OPERADOR: "Operador" };

export default function UsuariosPlataformaPage() {
  const [usuarios, setUsuarios] = useState<PlatformAdmin[] | null>(null);
  const [miEmail, setMiEmail] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  const [rolNuevo, setRolNuevo] = useState<RolPlataforma>("OPERADOR");
  const [invitando, setInvitando] = useState(false);
  const [quitandoId, setQuitandoId] = useState<string | null>(null);

  async function cargar() {
    const res = await fetch("/api/admin/platform-admins");
    if (!res.ok) {
      setUsuarios([]);
      return;
    }
    const json = await res.json();
    setUsuarios((json.data as PlatformAdmin[]) ?? []);
  }

  useEffect(() => {
    // Se difiere a un microtask para no llamar setState de forma síncrona
    // en el cuerpo del efecto (evita renders en cascada; regla
    // react-hooks), mismo patrón que useRealtimeLista.
    void Promise.resolve().then(cargar);
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setMiEmail(user?.email?.toLowerCase() ?? null);
    });
  }, []);

  // Deriva mi rol de la lista ya cargada (soy quien tiene mi propio correo)
  // en vez de un endpoint aparte — solo controla qué se muestra; el servidor
  // ya exige ADMIN en las rutas que invitan/quitan, esto es puramente UI.
  const miRol = usuarios?.find((u) => u.email.toLowerCase() === miEmail)?.rol ?? null;
  const puedoGestionar = miRol === "ADMIN";

  async function invitar() {
    if (!email.includes("@")) {
      toast.error("Ingresa un correo válido");
      return;
    }
    if (!nombre.trim()) {
      toast.error("Ingresa un nombre");
      return;
    }
    setInvitando(true);
    const res = await fetch("/api/admin/platform-admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, nombre, rol: rolNuevo }),
    });
    const json = await res.json();
    setInvitando(false);
    if (!res.ok) {
      toast.error("No se pudo invitar", { description: json.error });
      return;
    }
    toast.success(`Se envió un enlace para crear su contraseña a ${email}`);
    setEmail("");
    setNombre("");
    cargar();
  }

  async function quitar(u: PlatformAdmin) {
    if (!confirm(`¿Quitar acceso de plataforma a "${u.nombre}" (${u.email})?`)) return;
    setQuitandoId(u.id);
    const res = await fetch(`/api/admin/platform-admins/${u.id}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    setQuitandoId(null);
    if (!res.ok) {
      toast.error("No se pudo quitar", { description: json?.error });
      return;
    }
    toast.success(`Se quitó el acceso de "${u.nombre}"`);
    setUsuarios((prev) => (prev ? prev.filter((x) => x.id !== u.id) : prev));
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShieldCheck className="size-5 text-primary" />
          Usuarios de la plataforma
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Administradores y operadores del equipo LicitaAI — no son usuarios de una empresa
          cliente. Un Admin puede dar de alta o quitar a otros; un Operador solo consulta{" "}
          <span className="font-medium">Salud</span>.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cuentas activas</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {usuarios === null ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : usuarios.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Aún no hay administradores de plataforma registrados.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {usuarios.map((u) => (
                <li key={u.id} className="flex items-center gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{u.nombre}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <Badge variant={u.rol === "ADMIN" ? "default" : "outline"} className="text-xs">
                    {ROL_LABEL[u.rol]}
                  </Badge>
                  {puedoGestionar && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={quitandoId === u.id}
                      onClick={() => quitar(u)}
                      aria-label={`Quitar a ${u.nombre}`}
                    >
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {puedoGestionar && (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3">
              <Label className="text-xs text-muted-foreground">Dar de alta un usuario nuevo</Label>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="min-w-40 flex-1"
                />
                <Input
                  type="email"
                  placeholder="correo@licitaai.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-w-48 flex-1"
                />
                <Select value={rolNuevo} onValueChange={(v) => v && setRolNuevo(v as RolPlataforma)}>
                  <SelectTrigger size="sm" className="w-32">
                    <SelectValue>{() => ROL_LABEL[rolNuevo]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">Admin</SelectItem>
                    <SelectItem value="OPERADOR">Operador</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={invitar} disabled={invitando}>
                  <UserPlus className="size-3.5" />
                  {invitando ? "Enviando…" : "Dar de alta"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Se le envía un correo para que cree su propia contraseña — nunca se genera ni se
                muestra aquí.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
