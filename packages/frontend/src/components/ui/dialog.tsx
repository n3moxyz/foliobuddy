import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

type DialogPanelProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  mobileSheet?: boolean;
};

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Mount inside the portal so this captures the control which opened this dialog,
// including controlled dialogs that do not use a Radix DialogTrigger.
const DialogPanel = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogPanelProps
>(({ className, children, mobileSheet, onCloseAutoFocus, onEscapeKeyDown, ...props }, ref) => {
  const opener = React.useRef(document.activeElement);
  return (
    <DialogPrimitive.Content
      ref={ref}
      onEscapeKeyDown={(event) => {
        onEscapeKeyDown?.(event);
        // Radix observes Escape before the focused control can handle it. Leave it to
        // an expanded combobox, which closes its own popup, and to an inline box marked
        // data-cancel-on-escape, which cancels its own edit. Neither closes the dialog.
        const focused = document.activeElement;
        if (
          focused?.matches('input[role="combobox"][aria-expanded="true"]') ||
          focused?.closest('[data-cancel-on-escape]')
        ) {
          event.preventDefault();
        }
      }}
      onCloseAutoFocus={(event) => {
        onCloseAutoFocus?.(event);
        if (
          !event.defaultPrevented &&
          opener.current instanceof HTMLElement &&
          opener.current.isConnected
        ) {
          event.preventDefault();
          opener.current.focus({ preventScroll: true });
        }
      }}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto overscroll-contain rounded-lg border bg-background p-4 shadow-lg duration-200 ease-out-expo data-[state=open]:animate-in data-[state=closed]:animate-out sm:p-6',
        'sm:data-[state=open]:fade-in-0 sm:data-[state=closed]:fade-out-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95 sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]',
        mobileSheet
          ? 'max-h-[85vh] max-sm:bottom-0 max-sm:left-0 max-sm:top-auto max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[max(1rem,env(safe-area-inset-bottom))] max-sm:data-[state=open]:slide-in-from-bottom-full max-sm:data-[state=open]:[animation-duration:240ms] max-sm:data-[state=closed]:slide-out-to-bottom-full max-sm:data-[state=closed]:duration-150 max-sm:data-[state=closed]:ease-in'
          : 'max-sm:data-[state=open]:fade-in-0 max-sm:data-[state=open]:zoom-in-95 max-sm:data-[state=closed]:fade-out-0 max-sm:data-[state=closed]:zoom-out-95 max-sm:data-[state=closed]:duration-150',
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 h-11 w-11 sm:h-10 sm:w-10 flex items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  );
});
DialogPanel.displayName = 'DialogPanel';

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogPanelProps
>((props, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPanel ref={ref} {...props} />
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex min-w-0 flex-col space-y-1.5 pr-12 text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('break-words text-lg font-semibold leading-snug tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
