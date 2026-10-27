// FolioBuddy component library — types as documentation for window.FolioBuddy.
// The components are the app's own (packages/frontend/src/components); Radix-based parts
// accept every prop of the Radix primitive they wrap, summarised here.
import type * as React from 'react';

type Children = { children?: React.ReactNode };
type WithClass = { className?: string };
type OpenState = { open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void };
type Part<P, E = HTMLElement> = React.ForwardRefExoticComponent<P & React.RefAttributes<E>>;
type DivProps = React.HTMLAttributes<HTMLDivElement>;

// ── Actions ────────────────────────────────────────────────────────────────

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** default = primary fill (once per view) · destructive · outline · secondary · ghost · link */
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  /** default 44px→40px · sm 44px→36px · lg 44px, wide padding · icon 44px→40px square */
  size?: 'default' | 'sm' | 'lg' | 'icon';
  /** Render the child element (a router Link, an anchor) with button styling. */
  asChild?: boolean;
}
export declare const Button: Part<ButtonProps, HTMLButtonElement>;

// ── Forms ──────────────────────────────────────────────────────────────────

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;
export declare const Input: Part<InputProps, HTMLInputElement>;

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;
export declare const Textarea: Part<TextareaProps, HTMLTextAreaElement>;

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Id of the control this label names. */
  htmlFor?: string;
}
export declare const Label: Part<LabelProps, HTMLLabelElement>;

export interface CheckboxProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'value' | 'defaultChecked' | 'onChange'
> {
  checked?: boolean | 'indeterminate';
  defaultChecked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  name?: string;
  value?: string;
  required?: boolean;
}
export declare const Checkbox: Part<CheckboxProps, HTMLButtonElement>;

export interface FormattedNumberInputProps extends Omit<InputProps, 'type' | 'value' | 'onChange'> {
  /** Raw numeric string without separators, e.g. "12500.5". Shown as "12,500.5". */
  value: string;
  /** Receives the sanitised raw string. */
  onValueChange: (value: string) => void;
  /** Accept a leading minus. Default false: "-1" is rejected, never made positive. */
  allowNegative?: boolean;
}
export declare const FormattedNumberInput: Part<FormattedNumberInputProps, HTMLInputElement>;
/** "12500.5" → "12,500.5" */
export declare function formatNumberInputValue(value: string): string;
/** Strips separators and invalid characters; rejects a leading minus unless allowNegative. */
export declare function sanitizeNumberInput(value: string, allowNegative?: boolean): string;

export interface SelectProps extends OpenState, Children {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  required?: boolean;
}
export declare const Select: React.FC<SelectProps>;
export declare const SelectGroup: Part<DivProps>;
export declare const SelectValue: Part<{ placeholder?: React.ReactNode } & WithClass>;
export declare const SelectTrigger: Part<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  HTMLButtonElement
>;
/** Popper list on z-index 60, sized to its content (max 24rem tall). */
export declare const SelectContent: Part<
  DivProps & { position?: 'popper' | 'item-aligned'; align?: 'start' | 'center' | 'end' }
>;
export declare const SelectLabel: Part<DivProps>;
export declare const SelectItem: Part<
  DivProps & { value: string; disabled?: boolean; textValue?: string }
>;
export declare const SelectSeparator: Part<DivProps>;
export declare const SelectScrollUpButton: Part<DivProps>;
export declare const SelectScrollDownButton: Part<DivProps>;

export interface CreatableSelectProps {
  id?: string;
  value: string;
  options: string[];
  placeholder: string;
  /** The create row, e.g. "+ Add new broker". */
  addLabel: string;
  inputPlaceholder: string;
  /** Accessible name of the new-option input. */
  inputLabel: string;
  adding: boolean;
  inputValue: string;
  onValueChange: (value: string) => void;
  onStartAdding: () => void;
  onInputChange: (value: string) => void;
  /** Return the created option to select it, or null to refuse. */
  onAdd: () => string | null | void;
  onCancel: () => void;
  onEditOption?: (currentValue: string, nextValue: string) => string | null | void;
  /** Return false to veto the removal. */
  onDeleteOption?: (value: string) => boolean | void;
  onClearValue?: () => void;
  /** Return false for protected defaults. */
  isOptionEditable?: (value: string) => boolean;
}
export declare function CreatableSelect(props: CreatableSelectProps): React.ReactElement;

// ── Navigation ─────────────────────────────────────────────────────────────

export interface TabsProps extends DivProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
}
export declare const Tabs: Part<TabsProps>;
export declare const TabsList: Part<DivProps>;
export declare const TabsTrigger: Part<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string },
  HTMLButtonElement
>;
export declare const TabsContent: Part<DivProps & { value: string }>;

export interface DropdownMenuProps extends OpenState, Children {
  /** Default true. Pass false to keep the page interactive while open. */
  modal?: boolean;
}
type MenuItemProps = DivProps & {
  inset?: boolean;
  disabled?: boolean;
  onSelect?: (event: Event) => void;
};
export declare const DropdownMenu: React.FC<DropdownMenuProps>;
export declare const DropdownMenuTrigger: Part<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean },
  HTMLButtonElement
>;
export declare const DropdownMenuContent: Part<
  DivProps & {
    align?: 'start' | 'center' | 'end';
    side?: 'top' | 'right' | 'bottom' | 'left';
    sideOffset?: number;
  }
>;
export declare const DropdownMenuItem: Part<MenuItemProps>;
export declare const DropdownMenuCheckboxItem: Part<
  MenuItemProps & { checked?: boolean; onCheckedChange?: (checked: boolean) => void }
>;
export declare const DropdownMenuRadioGroup: Part<
  DivProps & { value?: string; onValueChange?: (value: string) => void }
>;
export declare const DropdownMenuRadioItem: Part<MenuItemProps & { value: string }>;
export declare const DropdownMenuLabel: Part<DivProps & { inset?: boolean }>;
export declare const DropdownMenuSeparator: Part<DivProps>;
export declare const DropdownMenuShortcut: React.FC<React.HTMLAttributes<HTMLSpanElement>>;
export declare const DropdownMenuGroup: Part<DivProps>;
export declare const DropdownMenuPortal: React.FC<Children>;
export declare const DropdownMenuSub: React.FC<OpenState & Children>;
export declare const DropdownMenuSubTrigger: Part<MenuItemProps>;
export declare const DropdownMenuSubContent: Part<DivProps>;

// ── Overlays ───────────────────────────────────────────────────────────────

export interface DialogProps extends OpenState, Children {
  modal?: boolean;
}
export declare const Dialog: React.FC<DialogProps>;
export declare const DialogTrigger: Part<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean },
  HTMLButtonElement
>;
export declare const DialogPortal: React.FC<Children & { container?: HTMLElement }>;
export declare const DialogOverlay: Part<DivProps>;
/** The panel: portal, scrim, focus return to the opener, close button. */
export declare const DialogContent: Part<
  DivProps & {
    onEscapeKeyDown?: (event: KeyboardEvent) => void;
    onCloseAutoFocus?: (event: Event) => void;
  }
>;
export declare const DialogHeader: React.FC<DivProps>;
export declare const DialogFooter: React.FC<DivProps>;
export declare const DialogTitle: Part<
  React.HTMLAttributes<HTMLHeadingElement>,
  HTMLHeadingElement
>;
export declare const DialogDescription: Part<
  React.HTMLAttributes<HTMLParagraphElement>,
  HTMLParagraphElement
>;
export declare const DialogClose: Part<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean },
  HTMLButtonElement
>;

export interface PopoverProps extends OpenState, Children {
  modal?: boolean;
}
export declare const Popover: React.FC<PopoverProps>;
export declare const PopoverTrigger: Part<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean },
  HTMLButtonElement
>;
export declare const PopoverContent: Part<
  DivProps & {
    align?: 'start' | 'center' | 'end';
    side?: 'top' | 'right' | 'bottom' | 'left';
    sideOffset?: number;
  }
>;

export interface TooltipProps extends OpenState, Children {
  delayDuration?: number;
}
export declare const TooltipProvider: React.FC<
  Children & { delayDuration?: number; skipDelayDuration?: number }
>;
export declare const Tooltip: React.FC<TooltipProps>;
export declare const TooltipTrigger: Part<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean },
  HTMLButtonElement
>;
export declare const TooltipContent: Part<
  DivProps & {
    side?: 'top' | 'right' | 'bottom' | 'left';
    sideOffset?: number;
    align?: 'start' | 'center' | 'end';
  }
>;

export interface HelpTooltipProps {
  /** One or two plain sentences defining the term. */
  content: string;
  /** The term, e.g. "Exposure" → accessible name "Help: Exposure". */
  label?: string;
}
export declare function HelpTooltip(props: HelpTooltipProps): React.ReactElement;

// ── Data ───────────────────────────────────────────────────────────────────

export type TableProps = React.HTMLAttributes<HTMLTableElement>;
export declare const Table: Part<TableProps, HTMLTableElement>;
export declare const TableHeader: Part<
  React.HTMLAttributes<HTMLTableSectionElement>,
  HTMLTableSectionElement
>;
export declare const TableBody: Part<
  React.HTMLAttributes<HTMLTableSectionElement>,
  HTMLTableSectionElement
>;
export declare const TableFooter: Part<
  React.HTMLAttributes<HTMLTableSectionElement>,
  HTMLTableSectionElement
>;
export declare const TableRow: Part<React.HTMLAttributes<HTMLTableRowElement>, HTMLTableRowElement>;
export declare const TableHead: Part<
  React.ThHTMLAttributes<HTMLTableCellElement>,
  HTMLTableCellElement
>;
export declare const TableCell: Part<
  React.TdHTMLAttributes<HTMLTableCellElement>,
  HTMLTableCellElement
>;
export declare const TableCaption: Part<
  React.HTMLAttributes<HTMLTableCaptionElement>,
  HTMLTableCaptionElement
>;

export interface SortableHeaderProps {
  label: string;
  sortKey: string;
  activeSortKey: string | null;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  align?: 'left' | 'right';
  style?: React.CSSProperties;
  className?: string;
}
export declare function SortableHeader(props: SortableHeaderProps): React.ReactElement;

export interface AssetIdentity {
  symbol: string;
  name?: string;
  /** e.g. LIQUID_CRYPTO, EQUITY, UNIT_TRUST, STABLECOIN, CASH */
  category?: string | null;
}
export interface AssetLabelProps {
  asset: AssetIdentity;
  /** A type chip shown after the ticker, e.g. the "UT" unit-trust badge. */
  badge?: React.ReactNode;
  nameOverride?: string;
  className?: string;
  alwaysShowName?: boolean;
}
export declare function AssetLabel(props: AssetLabelProps): React.ReactElement;
/** Short summary name: "DBS Group Holdings Ltd" → "DBS"; cash and stablecoins → "Cash". */
export declare function assetDisplayName(asset: AssetIdentity): string;

// ── Layout ─────────────────────────────────────────────────────────────────

export interface PageActionHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Small, non-destructive buttons. */
  actions: React.ReactNode;
  /** Panes hosted under the title row: hero stats, lens tabs, counts. */
  children?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** Default true. Portfolio and News pass false. */
  stickyOnMobile?: boolean;
}
export declare function PageActionHeader(props: PageActionHeaderProps): React.ReactElement;

export type CardProps = DivProps;
export declare const Card: Part<CardProps, HTMLDivElement>;
export declare const CardHeader: Part<DivProps, HTMLDivElement>;
export declare const CardTitle: Part<
  React.HTMLAttributes<HTMLHeadingElement>,
  HTMLParagraphElement
>;
export declare const CardDescription: Part<
  React.HTMLAttributes<HTMLParagraphElement>,
  HTMLParagraphElement
>;
export declare const CardContent: Part<DivProps, HTMLDivElement>;
export declare const CardFooter: Part<DivProps, HTMLDivElement>;

export interface CollapsibleCardProps {
  title: string | React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  titleHelp?: React.ReactNode;
  headerRight?: React.ReactNode;
  headerExtra?: React.ReactNode;
  /** A 16px lucide icon in the section's accent, e.g. Coins in text-crypto. */
  icon?: React.ReactNode;
  /** Card classes, e.g. "border-crypto/40 bg-crypto/5". */
  accentColor?: string;
  children: React.ReactNode;
}
export declare function CollapsibleCard(props: CollapsibleCardProps): React.ReactElement;

export interface CollapsibleProps extends OpenState, DivProps {
  disabled?: boolean;
}
export declare const Collapsible: Part<CollapsibleProps>;
export declare const CollapsibleTrigger: Part<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean },
  HTMLButtonElement
>;
export declare const CollapsibleContent: Part<DivProps & { forceMount?: true }>;

export interface SeparatorProps extends DivProps {
  orientation?: 'horizontal' | 'vertical';
  /** Default true (hidden from assistive tech). */
  decorative?: boolean;
}
export declare const Separator: Part<SeparatorProps>;

// ── Feedback ───────────────────────────────────────────────────────────────

export type SkeletonProps = DivProps;
export declare function Skeleton(props: SkeletonProps): React.ReactElement;

export interface QueryErrorNoticeProps {
  /** What failed to load, e.g. "positions". */
  subject: string;
  /** True when previously loaded data is still on screen. */
  hasData?: boolean;
  retrying?: boolean;
  onRetry: () => void;
}
export declare function QueryErrorNotice(props: QueryErrorNoticeProps): React.ReactElement;

export interface ImportResultItem {
  success: boolean;
  /** Symbol for positions and trades, timestamp for snapshots. */
  label: string;
  error?: string;
}
export interface ImportResultsListProps {
  results: ImportResultItem[];
  onDone: () => void;
}
export declare function ImportResultsList(props: ImportResultsListProps): React.ReactElement;

/** Mount once at the app root. Theme comes from useThemeStore. */
export type AppToasterProps = Record<string, never>;
export declare function AppToaster(props?: AppToasterProps): React.ReactElement;
/** Sonner's toast: toast.success('Prices refreshed'), toast.error('Price refresh failed'). */
export declare const toast: {
  (message: React.ReactNode, options?: object): string | number;
  success(message: React.ReactNode, options?: object): string | number;
  error(message: React.ReactNode, options?: object): string | number;
  info(message: React.ReactNode, options?: object): string | number;
  warning(message: React.ReactNode, options?: object): string | number;
  dismiss(id?: string | number): void;
};

// ── Utilities ──────────────────────────────────────────────────────────────

/** The app's theme store (zustand). setTheme also toggles the `.dark` class on <html>. */
export declare const useThemeStore: {
  (): {
    theme: 'light' | 'dark' | 'system';
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    cycleTheme: () => void;
  };
  getState(): {
    theme: 'light' | 'dark' | 'system';
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    cycleTheme: () => void;
  };
};
/** clsx + tailwind-merge. */
export declare function cn(...inputs: unknown[]): string;
/** The lucide icons the product uses (16px in buttons: className "h-4 w-4"). */
export declare const Icons: Record<
  | 'AlertCircle'
  | 'ArrowDown'
  | 'ArrowRight'
  | 'ArrowUpDown'
  | 'Banknote'
  | 'CalendarDays'
  | 'Camera'
  | 'Check'
  | 'CheckCircle2'
  | 'ChevronDown'
  | 'ChevronRight'
  | 'ChevronUp'
  | 'Coins'
  | 'Copy'
  | 'Download'
  | 'Eye'
  | 'EyeOff'
  | 'ExternalLink'
  | 'FileText'
  | 'Globe'
  | 'HelpCircle'
  | 'History'
  | 'LayoutDashboard'
  | 'LineChart'
  | 'Loader2'
  | 'Menu'
  | 'Monitor'
  | 'Moon'
  | 'MoreHorizontal'
  | 'MoreVertical'
  | 'Newspaper'
  | 'PanelLeftClose'
  | 'PanelLeftOpen'
  | 'Pencil'
  | 'Percent'
  | 'Plus'
  | 'RefreshCw'
  | 'Search'
  | 'Settings'
  | 'Sun'
  | 'Target'
  | 'Trash2'
  | 'TrendingDown'
  | 'TrendingUp'
  | 'Upload'
  | 'Users'
  | 'Wallet'
  | 'X',
  React.FC<
    React.SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }
  >
>;

declare global {
  interface Window {
    FolioBuddy: typeof import('./index');
  }
}
