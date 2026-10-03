# Workflow: Add MongoDB-Themed UI Component

This workflow automates the process of adding a new, premium UI component styled with the MongoDB design system into the Jaemangho squad dashboard.

## Activation Trigger
- Command: `/add-mongodb-component`
- Usage: `/add-mongodb-component <description of the component e.g. "a game match detail modal" or "a tier history chart widget">`

## Steps to Execute

### 1. Research and Reference DESIGN.md
- Open and read [DESIGN.md](file:///c:/Users/zes13/OneDrive/Dokumen/Jaemangho/DESIGN.md) to locate relevant component specs, color values, typography hierarchy, and shape tokens.
- Select the matching colors and structural properties:
  - Backgrounds: Canvas (`#ffffff` / `{colors.canvas}`) or Canvas Dark (`#001e2b` / `{colors.canvas-dark}`) for dark blocks.
  - Buttons: Universal pill shapes (`rounded.full`).
  - Cards: `rounded.lg` (12px rounded corners) with 1px border `hairline` (`#e1e5e8`).
  - Font: Euclid Circular A for standard texts, Source Code Pro for code snippets.

### 2. Design the Component Structure
- Create the new component as a TypeScript React file inside the `src/features/lol/components/` directory for League of Legends UI (e.g. `src/features/lol/components/MatchDetailsModal.tsx`); app-level UI such as the sidebar and admin dashboard stays in `src/components/`.
- Define explicit, typed Props to make the component highly reusable.
- Use explicit Inline Styles (matching `styles: { [key: string]: React.CSSProperties }` in other components) referencing the exact tokens from `DESIGN.md`.

### 3. Integrate into App Layout
- Open [src/App.tsx](file:///c:/Users/zes13/OneDrive/Dokumen/Jaemangho/src/App.tsx) and import the newly created component.
- Position the component within the appropriate view pane or tab state.
- Wire up any active state handlers (e.g. `useState` hooks) to drive interactive states (like open/close toggles, selected player stats, etc.).

### 4. Verification
- Confirm the new component compiles with no TypeScript or build warnings.
- Test responsive layouts (desktop, tablet, mobile widths) using CSS flex/grid and appropriate media-query scaling behaviors.
