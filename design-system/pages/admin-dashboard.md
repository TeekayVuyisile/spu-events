# Admin Dashboard: overrides

- Bento grid with 12 columns on desktop. KPI tiles are 1×1, the live check-ins chart is 2×2, and the upcoming events list is 2×1.
- KPI numbers use Outfit 700 at 2.5rem with a monospace delta chip (▲ success / ▼ destructive, always with an arrow icon).
- Live check-ins: a Recharts area chart (primary stroke, 20% fill) fed by SSE. It shows a "LIVE" pulse dot, a **pause** button and a "View as table" toggle.
- Motion: only the counters roll. Tiles fade in with a 40ms stagger on first load, not on refetch.
- Density: table rows are 44px tall and the sidebar collapses to icons below 1280px.
