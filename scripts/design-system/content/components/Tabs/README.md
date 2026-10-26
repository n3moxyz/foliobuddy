# Tabs

Radix tabs on a `muted` track: triggers are 44px on touch layouts and 32px from 640px, and the active one lifts onto `background` with `shadow-sm`.

- **Parts:** `Tabs` (`value`, `defaultValue`, `onValueChange`), `TabsList`, `TabsTrigger` (`value`), `TabsContent` (`value`).
- The list fills the width and scrolls sideways on phones, then shrinks to its content from 640px.
- Use tabs for peer views of the same data — the Trades lenses (Review, Ticker Dossier, Monthly Postmortem) or form modes (Edit Totals, Add/Reduce Position). Keep labels to one to three words.
- When a tab is a view people return to, keep it in the URL (`?view=monthly`).

Source: `packages/frontend/src/components/ui/tabs.tsx`.
