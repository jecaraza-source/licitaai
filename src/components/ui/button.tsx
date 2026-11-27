import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// Jerarquía: default (acción principal, una por vista) > secondary (acción
// de apoyo con tinte de marca) > outline (neutra, con borde firme) > ghost
// (terciaria, sin caja) > destructive (borra o descarta; contorno rojo, no
// relleno, para que no domine la pantalla) > link.
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent text-sm font-semibold tracking-[-0.005em] whitespace-nowrap transition-[background,border-color,box-shadow,color,transform] duration-150 outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:ring-offset-0 active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:shadow-none disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-[color-mix(in_oklab,var(--primary),black_14%)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary),white_9%),var(--primary))] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_1px_2px_rgb(16_40_28/0.28)] hover:bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary),white_3%),color-mix(in_oklab,var(--primary),black_9%))] focus-visible:border-[color-mix(in_oklab,var(--primary),black_14%)]",
        outline:
          "border-input bg-card text-foreground shadow-xs hover:border-foreground/30 hover:bg-muted/70 aria-expanded:border-foreground/30 aria-expanded:bg-muted/70 focus-visible:border-ring dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border-primary/15 bg-secondary text-secondary-foreground hover:border-primary/30 hover:bg-[color-mix(in_oklab,var(--secondary),var(--primary)_9%)] aria-expanded:bg-[color-mix(in_oklab,var(--secondary),var(--primary)_9%)] focus-visible:border-ring",
        ghost:
          "text-foreground/75 hover:bg-foreground/[0.06] hover:text-foreground aria-expanded:bg-foreground/[0.06] aria-expanded:text-foreground focus-visible:bg-foreground/[0.06]",
        destructive:
          "border-destructive/30 bg-card text-destructive shadow-xs hover:border-destructive/55 hover:bg-destructive/[0.07] focus-visible:border-destructive/60 focus-visible:ring-destructive/25 dark:bg-destructive/10 dark:hover:bg-destructive/20",
        link: "rounded-sm px-0.5 text-primary underline-offset-4 hover:underline focus-visible:ring-2",
      },
      size: {
        default:
          "h-9 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1.5 rounded-md px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5 in-data-[slot=button-group]:rounded-lg",
        sm: "h-8 gap-1.5 rounded-lg px-3 text-[0.8125rem] [&_svg:not([class*='size-'])]:size-3.5 in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        lg: "h-11 gap-2 rounded-xl px-5 text-[0.9375rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5 in-data-[slot=button-group]:rounded-lg",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3.5 in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-11 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
