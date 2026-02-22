# SPEC: Hide Cloud Features from Account Settings Page

## Status: Draft

## Problem

The Account Settings page (`screenpipe-app-tauri/components/settings/account-section.tsx`)
displays three cloud/subscription sections that are not relevant to Thadm right now:

1. **"thadm cloud ai"** card (lines 272-295) — shows free AI query limits and upgrade benefits
2. **"cloud audio transcription"** card (lines 298-322) — advertises cloud transcription to save RAM/CPU
3. **"plans"** section (lines 325-358) — shows subscription pricing (annual/monthly toggle + Stripe checkout)

These features point to screenpipe's cloud infrastructure (`screenpi.pe`) which Thadm does not use.
They should be hidden from the UI but the code must be preserved for potential future use.

## File

`screenpipe-app-tauri/components/settings/account-section.tsx`

## Sections to Comment Out

### 1. "thadm cloud ai" card
- **Lines**: 272-295
- **What it renders**: A `<Card>` inside a conditional `{!settings.user?.cloud_subscribed && (...)}`
  showing free AI query limits (25/50 per day) and upgrade pitch
- **Action**: Wrap JSX in `{/* THADM-HIDDEN: cloud ai features — uncomment when cloud AI is available */}`

### 2. "cloud audio transcription" card
- **Lines**: 298-322
- **What it renders**: A `<Card>` inside the same conditional block advertising cloud transcription
  benefits (RAM savings, CPU reduction, higher quality)
- **Action**: Wrap JSX in `{/* THADM-HIDDEN: cloud transcription — uncomment when cloud transcription is available */}`

### 3. "plans" section
- **Lines**: 325-358
- **What it renders**: The `<h4>plans</h4>` heading, `<PricingToggle>` (annual/monthly switch),
  and `<PlanCard>` list with Stripe checkout URLs
- **Action**: Wrap JSX in `{/* THADM-HIDDEN: subscription plans — uncomment when pricing is available */}`

## What to Keep Untouched

- **`PlanCard` component** (lines 25-72) — keep the component definition as-is
- **`PricingToggle` import** (line 20) — keep the import
- **`plans` array** (lines 133-176) — keep the data definition in JS
- **`handleConnectStripe`** (lines 178-203) — keep the function
- **`isAnnual` state** (line 77) — keep the state hook
- **Login/logout buttons** (lines 218-269) — these stay visible
- All other account management logic — no changes

## Commenting Convention

Use JSX comment blocks with a `THADM-HIDDEN:` prefix so they are easy to grep and re-enable later:

```tsx
{/* THADM-HIDDEN: <description> — uncomment when <condition>
<original JSX here>
*/}
```

## What the User Will See After

The Account Settings page will show only:
- Page title ("Account Settings")
- Login status + login/logout/manage buttons
- Empty space below (no cloud features, no plans)

## Out of Scope

- Removing any code or imports
- Changing the `screenpi.pe` URLs (separate rebrand task)
- Hiding the Account section from the settings sidebar
- Any backend/Rust changes
