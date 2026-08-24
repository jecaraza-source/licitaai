"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileStack, LayoutDashboard, PlusCircle, Scale, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/licitaciones", label: "Licitaciones", icon: FileStack },
  { href: "/licitaciones/nueva", label: "Nueva licitación", icon: PlusCircle, requiereEscritura: true },
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
  const items = NAV_ITEMS.filter((item) => !item.requiereEscritura || puedeEscribir);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-3">
        <Link href="/dashboard" className="flex items-center px-2">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt={empresaNombre ?? "Logo"}
              width={130}
              height={60}
              priority
              className="h-11 w-auto object-contain group-data-[collapsible=icon]:size-9"
            />
          ) : (
            <>
              <Image
                src="/branding/tci-logo-full.png"
                alt="TCI"
                width={130}
                height={60}
                priority
                className="h-11 w-auto group-data-[collapsible=icon]:hidden"
              />
              <Image
                src="/branding/tci-mark.png"
                alt="TCI"
                width={512}
                height={512}
                priority
                className="hidden size-9 group-data-[collapsible=icon]:block"
              />
            </>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm">Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive =
                  item.href === "/licitaciones"
                    ? pathname === "/licitaciones"
                    : pathname.startsWith(item.href);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive}
                      tooltip={item.label}
                      size="lg"
                      className="text-base [&_svg]:size-5"
                      render={
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
