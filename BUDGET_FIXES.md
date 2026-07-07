# Personal Budget App — 4 Fix Spec

Read `PROGRESS.md` and `BLOCKERS.md` before starting. Complete each step in order.
After each step: commit, update `PROGRESS.md`, verify in the running app before moving on.

---

## Step 1 — CSV → Supabase Transaction Import Script

**Goal:** A Node.js script (`scripts/import-csv.js`) that reads a bank CSV export, cleans
and categorizes transactions, deduplicates against existing Supabase data, and upserts
only the new rows.

### CSV Format (Amarillo National Bank export)
```
Account Number, Post Date, Check, Description, Debit, Credit, Status, Classification
"23122579", 6/3/2026, , "Van Leeuwen Ice Cream", 11.01, , Posted, "Food & Dining"
"23122579", 5/29/2026, , "Airbus Helicopte Payroll", , 975.14, Posted, "Paycheck"
```
- `Debit` = expense amount (positive number, column may be blank for income)
- `Credit` = income/refund amount (positive number, column may be blank for expenses)
- `Post Date` = M/D/YYYY
- `Status` = "Posted" or "Pending"

### Step 1a — Environment
The script lives at `scripts/import-csv.js`. It reads credentials from `.env.local`
using `dotenv` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Run as:
```bash
node scripts/import-csv.js <path-to-csv>
# e.g. node scripts/import-csv.js ~/Downloads/AccountHistory.csv
```

### Step 1b — Filtering rules (in order)
1. Skip any row where `Status !== "Posted"` — no pending transactions
2. Skip any row where `Description` contains "Transfer", "Zelle Transfer", or "Transfer to Venmo"
3. Skip any `Credit` row that is NOT a paycheck/income — merchant refunds and credits are excluded.
   A Credit row is income only if `Classification` contains "Paycheck" or `Description`
   matches known income patterns (e.g. "Payroll", "Dividend", "Schwab", "Tax Refund").
4. Skip duplicate rows that already exist in Supabase `transactions` table, matching on
   `date + amount + details` (case-insensitive on details).

### Step 1c — Merchant name cleaning
Strip these noisy prefixes from `Description` before using it as `details`:
```
- Any leading reference numbers (6-7 digit codes followed by space)
- "POS PREAUTH "
- "POS PURCHASE "
- "TST* "
- "SQ *"
- " Dallas TX ..."  (and trailing location/code noise)
- "&amp;" → "&"
```
Keep the cleaned name readable: "Chick-fil-A", "Van Leeuwen Ice Cream", "Claude.ai Subscription".

### Step 1d — Category mapping
Fetch all categories from Supabase `categories` table on startup to get their UUIDs.
Map cleaned merchant name to category name, then resolve to `category_id`:

| Category name (must match `categories.name` exactly) | Merchant patterns |
|------|------|
| Food | Chick-fil-A, Chipotle, Starbucks, 7 Brew, Taco Bell, Panera, McDonald's, Braums, Portillo's, Van Leeuwen, Whataburger, In-N-Out, Burger, McAlister's, Crowns Bar, Village Bur, Violet Crown |
| Groceries | Trader Joe's, Walmart Grocery, Kroger, HEB, Aldi, Mercado Juarez |
| Shopping | Amazon (Debit), Walmart (general), Target |
| Media | Claude.ai, Anthropic, Washington Post, Audible, Spotify, Netflix, Hulu, GoDaddy |
| Anna misc. | Flower shop, gift store patterns |
| Rock Climbing | Climbing gym |
| Trips/Outings | Hotels, Topgolf, Prairielakes, Golf, Amusement |
| Miscellaneous | Anything that doesn't match above |

For `type` field:
- Debit rows → `"expense"`
- Credit rows classified as income → `"income"`

### Step 1e — Deduplication
Before inserting, fetch existing transactions from Supabase for the date range in the CSV
(min date → max date). Build a Set of `"date|amount|details"` strings. Skip any row
whose key is already in the Set.

### Step 1f — Upsert
Insert all new rows into `transactions` using `supabase.from('transactions').insert([...])`.
The `effective_date` column is computed by the existing DB trigger — do NOT set it in
the script, let the trigger handle it.

### Step 1g — Output
After processing, print to console:
```
✓ Imported: 14 transactions
⊘ Skipped (duplicate): 3
⊘ Skipped (pending): 2
⊘ Skipped (transfer): 4
⊘ Skipped (refund/credit): 1

⚠ Flagged for review:
  - Amk Dbu Union Co ($6.71) → categorized as Miscellaneous, unknown merchant
  - Prairielakes Grand ($52.00) → categorized as Trips/Outings, verify
```

### Step 1h — Logging
After a successful run, rename the source CSV:
find the highest existing `AccountHistory(n).csv` number in the same directory,
increment by 1, rename the source file to `AccountHistory(n+1).csv`.

---

## Step 2 — Collapsible Years on Planning Tab

**Goal:** Each year header in the planning grid gets a toggle that collapses all 12 month
columns for that year into a single summary column showing annual totals. The year label
and a chevron remain visible. Clicking again re-expands.

### Implementation
In `PlanningPage.jsx` (or wherever the planning grid renders):

1. Add state: `const [collapsedYears, setCollapsedYears] = useState(new Set())`

2. Year header cell: render the year number + a chevron icon that flips direction based on
   collapsed state. The entire header cell is clickable.
   ```jsx
   <th onClick={() => toggleYear(year)} style={{ cursor: 'pointer' }}>
     {year} {collapsedYears.has(year) ? '›' : '˅'}
   </th>
   ```

3. `toggleYear` function:
   ```js
   const toggleYear = (year) => {
     setCollapsedYears(prev => {
       const next = new Set(prev);
       next.has(year) ? next.delete(year) : next.add(year);
       return next;
     });
   };
   ```

4. For each month column that belongs to a collapsed year, hide it:
   - Add `className` or inline style `display: collapsedYears.has(year) ? 'none' : ''`
     to every `<th>` and `<td>` in that year's month columns.

5. When a year is collapsed, show a single summary column in its place with the annual
   total for each category row. This summary `<td>` is only rendered when
   `collapsedYears.has(year)` is true, and hidden otherwise.

6. The "To be allocated" totals row should also collapse/expand with the same logic.

### Definition of Done
- Clicking a year header collapses all 12 month columns for that year into one annual total column
- The chevron direction reflects state
- Expanding works correctly — all 12 months return with their existing data
- No data is lost or re-fetched on collapse/expand (purely a display toggle)
- Collapsed state is local to the session (no persistence required)

---

## Step 3 — Bar Chart Fix: Tracked vs. Budget Overlay

**Goal:** The "Tracked vs. Budget" bar chart should show 3 series (Income, Expenses,
Savings), where for each series, the **budget amount is an outlined/ghost bar** and the
**tracked amount is a filled bar** rendered in front of it. This communicates both the
target and the actual in a single grouped chart without a separate "Budget" toggle.

### Current state (from screenshot)
The chart currently has Budget as a 4th separate checkbox series, rendered alongside
Income/Expenses/Savings. This is confusing — Budget should be the outline of each
series bar, not its own separate thing.

### Target behavior
For each month and each series, render two bars:
- **Budget bar** (back): outlined, transparent fill, colored stroke
- **Tracked bar** (front): filled, same color, slightly narrower width

In Recharts, this means rendering 6 `<Bar>` components in a `<BarChart>`:
```jsx
{/* Income pair */}
<Bar dataKey="budget_income"  fill="transparent" stroke="#22c55e" strokeWidth={2} barSize={16} />
<Bar dataKey="income"         fill="#22c55e"     fillOpacity={0.85}               barSize={12} />

{/* Expenses pair */}
<Bar dataKey="budget_expense" fill="transparent" stroke="#ef4444" strokeWidth={2} barSize={16} />
<Bar dataKey="expense"        fill="#ef4444"     fillOpacity={0.85}               barSize={12} />

{/* Savings pair */}
<Bar dataKey="budget_savings" fill="transparent" stroke="#3b82f6" strokeWidth={2} barSize={16} />
<Bar dataKey="savings"        fill="#3b82f6"     fillOpacity={0.85}               barSize={12} />
```

The currently selected period (month) should remain visually highlighted — apply
`fillOpacity={1.0}` for the active month and `fillOpacity={0.3}` for all others using a
`Cell` component or a custom bar shape.

### Data shape needed
The chart's data array should look like:
```js
[
  {
    month: 'Jan',
    income: 1250,        // tracked
    budget_income: 1500, // budgeted
    expense: 820,
    budget_expense: 1000,
    savings: 400,
    budget_savings: 500,
  },
  ...
]
```
Compute this by joining `budget_amounts` aggregates with `transactions` aggregates for
the selected year, grouped by month. Already available from the Dashboard data layer —
just extend the query/transform to include budget figures per series.

### Legend update
Remove the standalone "Budget" checkbox from the legend. Replace with a legend item that
shows an outlined rectangle labeled "Budget" and a filled rectangle labeled "Tracked",
acting as a single visual key for the dual-bar pattern.

### Definition of Done
- Chart shows 3 series with outlined budget bars and filled tracked bars
- The selected period month is visually distinct from other months
- The old "Budget" toggle is removed
- Chart re-renders correctly when year/period selector changes

---

## Step 4 — Sankey Diagram

**Goal:** Add a Sankey flow diagram to the Dashboard showing money flow from income
sources → total income pool → expense/savings categories.

### Library choice
Use `d3-sankey` (already likely available transitively through recharts, otherwise
`npm install d3-sankey`). Render it as a custom SVG component inside the Dashboard page.

### Layout
Two-level flow:
```
[Employment Income]  ─┐
[Bond Coupons]        ├─► [Total Income] ─┬─► [Food]
[Side Hustle]         ┘                   ├─► [Groceries]
                                          ├─► [Media]
                                          ├─► [Savings]
                                          └─► [Other Expenses]
```

### Data
For the currently selected period (year or month):
- Source nodes = income categories with tracked > 0
- Middle node = "Income" (sum of all income)
- Target nodes = expense/savings categories with tracked > 0

Derive amounts from the `transactions` table aggregated by `category_id` for the period,
joined to `categories` for names and types.

### Component
Create `src/components/SankeyChart.jsx`. Props: `{ data, width, height }`.
Use `d3.sankey()` to compute node/link positions. Render as `<svg>` with:
- Nodes as labeled rectangles (income = green, expense = red, savings = blue)
- Links as curved paths with `fillOpacity={0.3}` in the color of the source node
- Node labels positioned to avoid overlap (income labels left-aligned, expense labels right-aligned)

Place the Sankey chart below the existing doughnut charts in the Dashboard, behind a
tab or accordion labeled "Money Flow" so it doesn't crowd the existing summary.

### Definition of Done
- Sankey renders for the current selected year with no layout errors
- Node widths proportional to amounts
- Clicking a node highlights its connected links
- Chart recomputes when year selector changes
- Gracefully handles months/periods with no data (renders empty state message)

---

## Session Continuity
- Read `PROGRESS.md` at the start of every session
- Write blockers to `BLOCKERS.md` and move on rather than halting
- Commit after each completed step with message: `fix: step N — [description]`
- Never commit `.env.local` or any credentials
