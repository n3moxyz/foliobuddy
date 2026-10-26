# SortableHeader

Table header cell with a sort button: `ArrowUpDown` while idle, a chevron for the active direction, and the matching `aria-sort`.

- **You provide:** `label`, `sortKey`, `activeSortKey`, `sortDirection` ("asc" or "desc") and `onSort(key)`; optional `align` ("left" or "right"), `className` and `style`.
- You hold the sort state (the app uses its `useTableSort` hook). Right-align numeric columns with `align="right"`.
- The button fills the cell with a 44px minimum hit area below `md`.

Source: `packages/frontend/src/components/ui/SortableHeader.tsx`.
