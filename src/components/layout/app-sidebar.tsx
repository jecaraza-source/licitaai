"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileStack, LayoutDashboard, PlusCircle, Settings } from "lucide-react";
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
  { href: "/licitaciones/nueva", label: "Nueva licitación", icon: PlusCircle },
  { href: "/configuracion", label: "Configuración", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="py-3">
        <Link href="/dashboard" className="flex items-center px-2">
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
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-sm">Navegación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
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
