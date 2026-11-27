"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, FileStack, LayoutDashboard, Mail, PlusCircle, Scale, Settings, Users } from "lucide-react";
import { esRutaActiva } from "@/lib/navegacion";
import { CORREOS_COMPRAS_MX_ACTIVO } from "@/lib/funcionalidades";
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

// Ítem de menú: reposo discreto; el activo se levanta como una tarjeta con un
// indicador de marca a la izquierda (no solo color: forma + peso + posición).
const ITEM_CLASS =
  "relative h-10 gap-3 rounded-lg px-3 text-[0.9375rem] font-medium text-sidebar-foreground/75 hover:bg-card/70 hover:text-sidebar-foreground data-active:bg-card data-active:font-semibold data-active:text-primary data-active:shadow-[0_1px_2px_rgb(16_40_28/0.08),0_0_0_1px_var(--sidebar-border)] [&_svg]:size-[18px] data-active:[&_svg]:text-primary before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary before:opacity-0 data-active:before:opacity-100 group-data-[collapsible=icon]:before:hidden";
const GROUP_LABEL_CLASS =
  "mb-1 px-3 text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80";

const OPERATION_ITEMS = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/licitaciones", label: "Licitaciones", icon: FileStack },
  { href: "/licitaciones/nueva", label: "Nueva licitación", icon: PlusCircle, requiereEscritura: true },
  ...(CORREOS_COMPRAS_MX_ACTIVO ? [{ href: "/correos", label: "Correos", icon: Mail }] : []),
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
      <SidebarHeader className="px-4 pt-5 pb-4">
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
      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel className={GROUP_LABEL_CLASS}>
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
                      className={ITEM_CLASS}
                      render={<Link href={item.href}><item.icon /><span>{item.label}</span></Link>}
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-3">
          <SidebarGroupLabel className={GROUP_LABEL_CLASS}>
            Gestión
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.filter((item) => item.href === "/referencias" || item.href === "/configuracion").map((item) => {
                const isActive = esRutaActiva(item.href, pathname);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton isActive={isActive} tooltip={item.label} className={ITEM_CLASS} render={<Link href={item.href}><item.icon /><span>{item.label}</span></Link>} />
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
            <SidebarGroupLabel className={GROUP_LABEL_CLASS}>
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN_ITEMS.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={`Admin · ${item.label}`}
                      className={ITEM_CLASS}
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
