"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, FileStack, LayoutDashboard, Mail, PlusCircle, Scale, Settings, Users } from "lucide-react";
import { esRutaActiva } from "@/lib/navegacion";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const LICITAAI_LOGO = "/branding/licitaai-dashboard-horizontal.png";

const OPERATION_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/licitaciones", label: "Licitaciones", icon: FileStack },
  { href: "/licitaciones/nueva", label: "Nueva licitación", icon: PlusCircle, requiereEscritura: true },
  { href: "/correos", label: "Correos", icon: Mail },
];

const MANAGEMENT_ITEMS = [
  { href: "/referencias", label: "Referencias", icon: Scale },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

const ADMIN_ITEMS = [
  { href: "/admin/salud", label: "Salud", icon: Activity },
  { href: "/admin/usuarios", label: "Usuarios", icon: Users },
];

export function AppSidebar({
  puedeEscribir = true,
  mostrarAdmin = false,
  logoUrl,
  empresaNombre,
}: {
  puedeEscribir?: boolean;
  /** Admins de plataforma: muestra el grupo "Admin" al pie de la barra. */
  mostrarAdmin?: boolean;
  logoUrl?: string | null;
  empresaNombre?: string | null;
}) {
  const pathname = usePathname();
  const items = [...OPERATION_ITEMS, ...MANAGEMENT_ITEMS].filter(
    (item) => !("requiereEscritura" in item) || !item.requiereEscritura || puedeEscribir,
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-3">
        <Link href="/dashboard" className="flex w-full items-center justify-center px-2">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={empresaNombre ?? "Logo"}
              width={130}
              height={60}
              priority
              className="h-14 w-auto object-contain group-data-[collapsible=icon]:size-9"
            />
          ) : (
            <Image
              src={LICITAAI_LOGO}
              alt="LicitaAI"
              width={220}
              height={90}
              priority
              unoptimized
              className="h-14 w-auto max-w-full object-contain group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9"
            />
          )}
          {/* Fallback de marca textual oculto visualmente para lectores de pantalla */}
          <span className="sr-only">{empresaNombre ?? "LicitaAI"}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Operación
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.filter((item) => item.href === "/dashboard" || item.href.startsWith("/licitaciones") || item.href === "/correos").map((item) => {
                const isActive = esRutaActiva(item.href, pathname);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      size="lg"
                      className="text-base [&_svg]:size-5"
                      render={<Link href={item.href}><item.icon /><span>{item.label}</span></Link>}
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-2">
          <SidebarGroupLabel className="px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Gestión
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.filter((item) => item.href === "/referencias" || item.href === "/configuracion").map((item) => {
                const isActive = esRutaActiva(item.href, pathname);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton isActive={isActive} tooltip={item.label} size="lg" className="text-base [&_svg]:size-5" render={<Link href={item.href}><item.icon /><span>{item.label}</span></Link>} />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        {mostrarAdmin && (
          <SidebarGroup className="p-0">
            <SidebarGroupLabel className="px-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={`Admin · ${item.label}`}
                      size="lg"
                      className="text-base [&_svg]:size-5"
                      render={<Link href={item.href}><item.icon /><span>{item.label}</span></Link>}
                    />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
