# Skeleton

Loading placeholder: a `muted` block swept by an 8% `muted-foreground` shimmer every 1.5 seconds.

- Size it with classes (`h-9 w-48`, `h-12 w-full`) to match what it stands in for.
- Wrap a loading region in `role="status"` with screen-reader text ("Loading positions…").
- Show skeletons on the first load only (React Query `isPending`). During a refresh, keep the loaded data on screen.

Source: `packages/frontend/src/components/ui/skeleton.tsx`.
