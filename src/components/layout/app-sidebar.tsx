"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileStack, LayoutDashboard, PlusCircle, Scale, Settings } from "lucide-react";
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
  { href: "/dashboard", label: "Resumen", icon: LayoutDashboard },
  { href: "/licitaciones", label: "Licitaciones", icon: FileStack },
  { href: "/licitaciones/nueva", label: "Nueva licitación", icon: PlusCircle, requiereEscritura: true },
];

const MANAGEMENT_ITEMS = [
  { href: "/referencias", label: "Referencias", icon: Scale },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppSidebar({
  puedeEscribir = true,
  logoUrl,
  empresaNombre,
}: {
  puedeEscribir?: boolean;
  logoUrl?: string | null;
  empresaNombre?: string | null;
}) {
  const pathname = usePathname();
  const items = [...OPERATION_ITEMS, ...MANAGEMENT_ITEMS].filter(
    (item) => !("requiereEscritura" in item) || !item.requiereEscritura || puedeEscribir,
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-4">
        <Link href="/dashboard" className="flex w-full items-center justify-center px-2">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={empresaNombre ?? "Logo"}
              width={130}
              height={60}
              priority
              className="h-16 w-auto object-contain group-data-[collapsible=icon]:size-9"
            />
          ) : (
            <Image
              src={LICITAAI_LOGO}
              alt="LicitaAI"
              width={220}
              height={90}
              priority
              unoptimized
              className="h-40 w-auto max-w-full object-contain group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9"
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
              {items.filter((item) => item.href === "/dashboard" || item.href.startsWith("/licitaciones")).map((item) => {
                const isActive = item.href === "/licitaciones" ? pathname === "/licitaciones" : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      size="lg"
                      className={item.href === "/licitaciones/nueva" ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground text-base [&_svg]:size-5" : "text-base [&_svg]:size-5"}
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
                const isActive = pathname.startsWith(item.href);
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
      <SidebarFooter className="items-center group-data-[collapsible=icon]:hidden">
        <Image
          src={LICITAAI_LOGO}
          alt="LicitaAI"
          width={220}
          height={90}
          unoptimized
          className="h-42 w-auto max-w-full object-contain"
        />
      </SidebarFooter>
    </Sidebar>
  );
}
