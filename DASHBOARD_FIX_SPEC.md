# Dashboard Fixes — Tracked vs Budget Chart & Money Flow (Sankey)

**Context:** Phase 5 (Dashboard) has shipped, but both the "Tracked vs. budget by month" bar chart and the new "Money Flow" Sankey diagram have real, visible defects in production. This spec documents each precisely enough to fix without further back-and-forth. Work through Issue 4 first — it determines whether the rest of the bar chart work is even worth doing yet.

---

## Bar Chart: "Tracked vs. budget by month"

### Issue 1 — Tooltip is broken
**Symptom:** hovering produces an oversized white box with default/unstyled formatting that visually breaks the layout and clashes with the dark theme.

**Fix:**
- Style the chart tooltip with a dark-theme-consistent background (matching the panel background), light text, thin border, small padding, rounded corners
- Cap its width so it can't dominate the chart area
- Confirm it only appears on hover over a specific bar/month, never persistently rendered
- Content should be scoped to the single hovered month only, values formatted as currency

### Issue 2 — Current-period highlight renders as a harsh flat box
**Symptom:** a solid gray rectangle spans full chart height behind the current month, clashing with the dark background.

**Fix:**
- Replace with a subtle translucent overlay (low-opacity, on-theme), sized precisely to that one month's bar group — not the full chart width
- Confirm the highlighted month always tracks the Period selector's current value, not a hardcoded index

### Issue 3 — Legend doesn't communicate the actual encoding
**Symptom:** legend shows five separate swatches (Budget, Tracked, Income, Expenses, Savings) but the real encoding is two-dimensional: outline = Budget vs. filled = Tracked, and color = category type. As-is this reads as five unrelated items.

**Fix:**
- Split into two small legend groups — a style legend (outline vs. filled, labeled Budget / Tracked) and a color legend (Income / Expenses / Savings) — or add a one-line caption under the chart title clarifying the outline-vs-filled convention

### Issue 4 — Most months show flat, near-zero bars (investigate before styling)
**Symptom:** only Jan, Feb, May, and Jun show meaningful bar heights; Mar, Apr, and Jul–Dec appear essentially empty.

**This may be a data problem, not a chart problem — resolve root cause before touching styling:**
- Query `budget_amounts` directly and confirm it actually has rows for every category × every month for the selected year — don't assume the Planning grid data made it into the database correctly
- Check whether the dashboard query is inadvertently filtering out months with no transactions, instead of correctly showing budget vs. $0 tracked for untracked months
- It's also possible this is accurate — if live tracking has only been happening for a few months and the rest of the year is budget-only placeholder data, flat bars for future months would be *correct*, not a bug
- Do not paper over this with hardcoded or fabricated data. Identify which of the two it is and write the finding to `PROGRESS.md` before proceeding

---

## Money Flow (Sankey Diagram)

### Issue 5 — Title label is clipped
**Symptom:** the "Income" label at the top-center renders partially cut off / visually corrupted.

**Fix:** increase top margin above the node area so labels aren't clipped by the container edge at any screen width.

### Issue 6 — No labels on any node
**Symptom:** neither the income-source nodes (left) nor the expense/savings-destination nodes (right) show any category name. The diagram is currently uninterpretable.

**Fix:**
- Label every node with its category name, positioned outside the node bar (left-aligned outside left-side nodes, right-aligned outside right-side nodes) so labels don't get clipped by flow bands
- Truncate long names with an ellipsis if space is tight; show the full name on hover

### Issue 7 — Flows and nodes ignore the established category color palette
**Symptom:** every flow band renders as the same uniform navy/purple regardless of category; nodes are colored only by broad type (green/red/blue) instead of the specific per-category colors already used in the doughnut charts on this same dashboard.

**Fix:** reuse the exact same category → color mapping from the doughnut charts for both nodes and their flow bands here, so a category's color is consistent across every chart type on the dashboard.

### Issue 8 — No value tooltips
**Symptom:** no way to see the dollar amount a flow or node represents.

**Fix:** add hover tooltips on nodes and links showing category name and amount as currency, using the same tooltip styling fixed in Issue 1.

### Issue 9 — Confirm it actually respects the Year/Period selectors
Not verifiable from a screenshot alone — explicitly confirm:
- Changing Year or Period recomputes the Sankey's flows, same as it does for the doughnut and bar charts
- If it currently always shows all-time or a hardcoded period regardless of selector state, that's a bug to fix here too

---

## Suggested order of work
1. Issue 4 (data investigation) — determines whether the rest of the bar chart fixes are meaningful to verify yet
2. Issues 1–3 (bar chart polish)
3. Issues 5–9 (Sankey) — labels and color first, since an unlabeled, uncolored diagram can't be meaningfully checked against the tooltip/selector fixes

## Definition of Done
- Bar chart: tooltip is small, dark-themed, hover-only, and scoped to the hovered month; current-period highlight is a subtle band sized to one month; legend clearly communicates the two-dimensional Budget/Tracked × category-color encoding
- Sankey: every node labeled; colors match the established per-category palette; tooltips show exact dollar values; diagram responds correctly to Year/Period selector changes
- Root cause of the flat-bar months is identified and either fixed (data/query bug) or confirmed accurate (genuinely sparse data), with the finding recorded in `PROGRESS.md`
