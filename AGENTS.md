<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Luxury Royal UI/UX & Tailwind v4 (Design & Architecture Guidelines)
The official design language and architecture for **"Taj Al-Mawadah ERP & POS"** is **Luxury Royal UI/UX** using **Tailwind CSS v4**, paired with a strict **Offline-First** architecture. When creating or updating components and business logic, you MUST adhere to the following rules:

1. **Luxury Palette:**
   - **Primary Text & Shell (Royal Coffee)**: `#1E130B` - Main text, headings, sidebars, and dark accents.
   - **Accent & Primary Buttons (Luxury Gold)**: `#C29B62` - Primary buttons, active icons, focus rings (`focus:ring-[#C29B62]`).
   - **Highlight & Alerts (Rust/Terracotta)**: `#A8573C` - Alerts, destructive actions, highlight badges.
   - **App Background (Pure Pearl)**: `#FDFBF7` - Main application background for light mode (eye-friendly for cashiers).
   - **Success (Emerald Green)**: `#059669` - Success badges, in-stock indicators, payment confirmation.

2. **Styling & Components (Solid & Elegant):**
   - **No Heavy Glassmorphism:** Strictly avoid heavy `backdrop-filter: blur(...)` to maximize performance on POS machines.
   - **Cards:** Solid pure white background (`bg-white` / `#FFFFFF`) with smooth rounded corners (`rounded-xl` or `rounded-2xl`).
   - **Borders:** Subtle gold borders for active cards: `border: 1px solid rgba(194, 155, 98, 0.2)`.
   - **Shadows:** Deep, soft luxury shadows: `box-shadow: 0 4px 20px rgba(30, 19, 11, 0.05);` lifting slightly on hover (`hover:-translate-y-0.5`).
   - **Alerts & Toasts:** NEVER use native browser `alert()` or `confirm()`. Use custom branded Toast notifications.
   - **Print Stylesheet:** Include clean thermal receipt and A4 print styles using `@media print` on all invoice/statement views, hiding UI chrome.

3. **Offline-First Resilience:**
   - All mutations in POS/Inventory must route through `executeWithOfflineSync` (`lib/offline/offlineExecutor.ts`).
   - Data fetching for POS must use `cached()` and `resources.ts` via the RAM Cache (`lib/cache/dataCache.ts`).
   - Offline queue (`sync_queue`) is handled by `idb` (`lib/offline/syncStore.ts`) and synced via `syncManager.ts`.

4. **Mobile & POS Touch Responsiveness:**
   - Touch targets must be at least `44px` height (`min-h-[44px]`).
   - Tables must have horizontal scrolling (`overflow-x: auto`).
   - Modals take `95vw` on mobile screens.
   - Full RTL Arabic typography using Google's `Cairo` font.

