import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

const InsideTooltipProvider = React.createContext(false);

const TooltipProvider = ({
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <InsideTooltipProvider.Provider value>
    <TooltipPrimitive.Provider {...props}>{children}</TooltipPrimitive.Provider>
  </InsideTooltipProvider.Provider>
);

// Tooltips under one provider share its warm window: after one closes, the next opens at once.
// A provider of its own would cut a tooltip out of that, so a component that can also render
// alone (HelpTooltip in isolated tests) adds one only when no ancestor has one.
const TooltipProviderIfMissing = ({ children }: { children: React.ReactNode }) =>
  React.useContext(InsideTooltipProvider) ? (
    children
  ) : (
    <TooltipProvider>{children}</TooltipProvider>
  );

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  // Portaled to <body> so a popup can't inherit text styles (white-space, font,
  // text-align) from, or be clipped by, wherever its trigger happens to sit.
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      // Only a tooltip that waited out its hover delay fades in. Focus, taps and the next tooltip
      // along a row (Radix's instant-open) appear at once, and every tooltip closes at once.
      className={cn(
        'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md ease-out-expo data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipProviderIfMissing };
