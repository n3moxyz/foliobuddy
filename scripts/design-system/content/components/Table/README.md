# Table

Semantic table parts: 14px text, 48px `muted-foreground` header cells, 16px cell padding, hairline row borders and a `muted` 50% hover.

- **Parts:** `Table` (wrapped in a horizontal scroller), `TableHeader`, `TableBody`, `TableFooter`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`.
- Right-align figures in `font-mono text-sm`: values `font-medium`, current prices `text-muted-foreground`. A P&L cell stacks the amount over the percentage in `text-profit` or `text-loss`.
- Identity cells use `AssetLabel`. Native-currency hints sit under prices in 11px `muted-foreground`.
- Below `md`, position tables render as cards. Wide tables keep content-sized columns and scroll sideways.
- **Clickable rows:** guard the row's key handler with `e.currentTarget === e.target`, and stop both click and keydown propagation in action cells, so a nested Enter never fires the row.
- Sortable columns use `SortableHeader`.

Source: `packages/frontend/src/components/ui/table.tsx`.
