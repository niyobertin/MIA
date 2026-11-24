# MIA navigation map

How the mobile app and the web dashboard are organised, and where every business feature lives.

## Audit: what we found (before)

### Mobile app
- **Bottom bar had 5 tabs**: Home, Products, Sale, Workers (waiter tabs), More. "Workers" was a top-level tab for every role, even though waiter tabs are really a way of selling: the checkout already has a "give to worker" mode.
- **11 hidden screens** were reached only through scattered links:
  - **Stock-in** couldn't be opened from the Products tab at all, only from Home, a product's page, or the buy list.
  - **Stock movements** was only in More.
  - **Stock report** (stock on a chosen date) was **unreachable**: no link anywhere.
  - **Day closing** was not in any menu, only on Home.
- **Duplicates**:
  - Home's **"More" sheet** was a second menu that repeated items from the More tab (customer payment, supplier payment, customers, reports).
  - More had both a **Sync** item and a separate **Sync status** row.
  - A **Language screen** existed but nothing linked to it. Language is switched inline on More.
  - **Suppliers** had two "add" buttons: one in the header and one floating.
  - **About** and **Help** were two separate menu items.
- **Missing operation**: other income is counted in cash and profit, but there was **no way to record it**.
- **Bug**: tapping a supplier opened the payment screen without selecting that supplier.

### Web dashboard
- **18 sidebar links** in 4 groups. Several were views of the same thing: Sales / Unpaid sales / Waiter tabs; Products / Stock-in / Movements / Stock report; Payments / Expenses; Customers / Suppliers; Settings / Staff / Activity log.

## Structure now

### Mobile: 4 tabs (was 5)

| Tab | What's there |
|---|---|
| **Home** | Day status, today's totals, alerts. Shortcuts: **New sale**, Stock in, Expense, **Receive payment**, Start/Close day |
| **Sell** (centre button) | New sale · Sales history · **Worker tabs** (button in the header) |
| **Products** | Product list, add/import products, buy list. Tool row: **Stock in · Movements · By date** |
| **More** | **Business**: Reports, Day & cash*, Customers & suppliers, Expenses & income. **Settings**: Business*, Users*, Change PIN, Activity log*, Help (with About inside). **Preferences**: Language, Sync status |

\* Shown only to roles that are allowed to use it. The rules are unchanged.

### Web dashboard: 9 sidebar items (was 18)

| Sidebar | Sub-tabs |
|---|---|
| **Daily** › Dashboard | — |
| **Daily** › New sale | — |
| **Daily** › Day & cash | — |
| **Business** › Sales | All sales · Unpaid · Waiter tabs |
| **Business** › Expenses & payments | Expenses · Payments |
| **Business** › Stock | Products · Stock-in · Movements · Stock report |
| **Business** › Customers & suppliers | Customers · Suppliers |
| **Business** › Reports | — |
| **Admin** › Settings | Business · Staff & roles · Activity log |

- Every old URL (`/unpaid`, `/movements`, `/staff`, …) still works and opens inside its module.
- Sub-tabs follow permissions. A module only shows tabs the person can open, and it hides the tab strip when there is only one.

### Dashboard pages with tables
- Every page with a table has a row of stat cards at the top and a date filter. The cards follow the date filter and the search box, so they always describe the rows underneath. Totals come from the same request as the table (`summary` on each list endpoint).
- Stock report is the exception: it shows live stock right now, so it has no date filter.
- Stat numbers size themselves to the width of their card (container queries), so amounts fit on phones, tablets and desktops. Wide tables scroll sideways inside their card instead of squeezing.
- If a page fails to load, an error card appears inside the layout and the menu stays usable. The whole screen no longer goes white.

## Where every business operation lives

| Operation | Mobile | Web |
|---|---|---|
| Daily overview | Home | Dashboard |
| Sales & receipts | Sell | New sale; Sales › All sales |
| Unpaid sales / receivables | Sell › History; More › Customers & suppliers | Sales › Unpaid; Customers |
| Waiter / worker tabs | Sell › Worker tabs | Sales › Waiter tabs |
| Purchases / stock-in | Products › Stock in; Home shortcut | Stock › Stock-in |
| Products & inventory | Products | Stock › Products |
| Stock history | Products › Movements, By date | Stock › Movements, Stock report |
| Customers | More › Customers & suppliers | Customers & suppliers › Customers |
| Suppliers / payables | More › Customers & suppliers › Suppliers | Customers & suppliers › Suppliers |
| Customer payments | Home › Receive payment; tap a customer | Customers (pay action); Expenses & payments › Payments |
| Supplier payments | Tap a supplier | Suppliers (pay action) |
| Expenses | More › Expenses & income; Home shortcut | Expenses & payments › Expenses |
| **Other income** (new) | More › Expenses & income › Other income | Shown in reports and day totals |
| Cash & daily closing | Home day card; More › Day & cash | Day & cash |
| Profit & loss, reports | More › Reports | Reports |
| Business settings | More › Business | Settings › Business |
| Users, roles | More › Users | Settings › Staff & roles |
| Audit trail | More › Activity log | Settings › Activity log |
| Sync | Header sync icon; More › Sync status | — |

## Guard rails
`__tests__/navigation-routes.test.ts` fails if any in-app link points at a missing screen, if the bottom bar grows past four tabs, or if a business screen stops being reachable from a tab, menu or shortcut.
