import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { shortcuts } from '@/hooks/useKeyboardShortcuts';

interface ShortcutsHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsHelpModal({ open, onOpenChange }: ShortcutsHelpModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.key}
              className="flex items-center justify-between py-2 border-b border-border last:border-0"
            >
              <span className="text-sm text-muted-foreground">{shortcut.description}</span>
              <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Press <kbd className="px-1 py-0.5 text-xs font-mono bg-muted rounded border">Esc</kbd> to
          close
        </p>
      </DialogContent>
    </Dialog>
  );
}
