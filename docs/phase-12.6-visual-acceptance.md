# SAVORÉ Phase 12.6 browser acceptance record

Status: **NOT TESTED**. This handover run does not claim interactive browser visual, keyboard-only, or screen-reader acceptance. HTTP smoke responses and database-backed API flows are reported separately and do not count as visual acceptance. Do not claim WCAG 2.2 AA or exact 51-screen design parity from this checklist.

## Start the local demo

From PowerShell in the repository:

```powershell
Set-Location 'C:\Users\SHBLBLRDSK-26\Downloads\SAVORE_Phase9_2_Offline_Validation_Patch\_phase101_remote_clone'
npm.cmd run demo:verify
npm.cmd run demo:start
```

In a second terminal, prepare a fresh reservation-backed QR session before opening a QR page: `$env:SAVORE_DEMO_BASE_URL='http://localhost:3015'; npm.cmd run demo:qr:prepare`. For the production preview, use `http://localhost:3016` after `npm.cmd run demo:start:prod`. The preparation script creates/uses only the marked isolated demo fixtures through customer and host APIs; it does not extend an expired session. The token stays in ignored `.env.client-demo`; retrieve it only through the operator's local secure process. Never paste it into this record or save a QR URL in screenshots.

Open `http://127.0.0.1:3015` in the normal browser. In browser developer tools, use responsive device mode and inspect at **390px**, **768px**, and **1440px**. Keep the development server bound to loopback. Use the fictional role accounts listed in [the client demo guide](phase-12.5-client-demo.md); retrieve passwords and the T03 token only through the approved local secure process. Never copy those values into notes, screenshots, browser recordings, or this acceptance record. Stop with Ctrl+C.

## Screen status

Each cell is the visual-browser status. Current server/API smoke coverage is summarized in the last column and does not change a visual status from NOT TESTED.

| Experience / screen set | Routes to inspect | 390px | 768px | 1440px | Latest automated HTTP coverage |
|---|---|---|---|---|---|
| Customer | `/`, `/menu`, `/menu/[slug]`, `/login`, `/register`, `/account`, `/account/profile`, `/account/favorites`, `/reservations`, `/account/reservations`, `/cart`, `/order-online`, `/orders/[id]` | NOT TESTED | NOT TESTED | NOT TESTED | Home, menu, reservations, cart/order-online and customer account/favorites/reservations returned expected HTTP responses; not every listed route was exercised in the demo smoke run. |
| Host | `/staff/host`, `/staff/host/calendar`, `/staff/host/reservations/[id]`, `/staff/host/walk-ins`, `/staff/waitlist`, `/staff/check-in` | NOT TESTED | NOT TESTED | NOT TESTED | Host dashboard/calendar, waitlist and role redirects checked; deeper pages covered by integration HTTP tests. |
| Floor | `/staff/floor` | NOT TESTED | NOT TESTED | NOT TESTED | Host floor route and database-derived floor board checked by integration tests. |
| Waiter | `/staff/service` | NOT TESTED | NOT TESTED | NOT TESTED | Waiter login and service board returned expected HTTP responses. |
| Chef | `/staff/kitchen`, `/staff/kitchen/[id]` | NOT TESTED | NOT TESTED | NOT TESTED | Kitchen queue and role restrictions checked; pagination and status were exercised by integration tests. |
| Manager | `/staff/admin`, `/staff/admin/menu`, `/staff/admin/team`, `/staff/admin/reports`, `/staff/admin/settings`, `/staff/admin/audit` | NOT TESTED | NOT TESTED | NOT TESTED | Dashboard, reports, and role access checked; administration data flows were exercised by integration tests. |
| Owner | `/staff/admin/settings`, `/staff/admin/team`, `/staff/admin/audit` | NOT TESTED | NOT TESTED | NOT TESTED | Owner login and settings route returned expected HTTP response; detailed screens remain visually unreviewed. |
| QR guest | `/qr/<current local demo token>`, `/qr/<current local demo token>/menu`, `/qr/orders/[id]` | NOT TESTED | NOT TESTED | NOT TESTED | Welcome, claim, menu, order/tracking HTTP/API checks are separate from visual acceptance. |

## Manual checks at each width

For every screen, mark a result only after the human reviewer sees it. Check page overflow, readable type and contrast, image availability and fallback dimensions, navigation, field labels/errors, empty/loading/error states, dialogs, table usability, and role-restricted links. Use keyboard-only navigation to check logical tab order, visible unclipped focus, form errors, and dialog focus. Check announcements with a screen reader; do not infer their correctness from source review alone.

| Check | 390px | 768px | 1440px | Notes/evidence |
|---|---|---|---|---|
| Navigation and route transitions | NOT TESTED | NOT TESTED | NOT TESTED | |
| Typography, contrast, and image fallbacks | NOT TESTED | NOT TESTED | NOT TESTED | |
| Forms, validation, loading, error and empty states | NOT TESTED | NOT TESTED | NOT TESTED | |
| Reservation calendar and floor plan | NOT TESTED | NOT TESTED | NOT TESTED | |
| Kitchen queue pagination and controls | NOT TESTED | NOT TESTED | NOT TESTED | |
| Administration tables, charts and reports | NOT TESTED | NOT TESTED | NOT TESTED | |
| QR menu, cart and tracking | NOT TESTED | NOT TESTED | NOT TESTED | |
| Keyboard-only and visible focus | NOT TESTED | NOT TESTED | NOT TESTED | |
| Screen-reader announcements | NOT TESTED | NOT TESTED | NOT TESTED | |

Reviewer: ____________________  Date: ____________________

Browser/version and device/OS: ______________________________________

Approved client reference/version: __________________________________

Defects and evidence: _______________________________________________

## Acceptance limitations

No real browser has completed the visual, responsive, keyboard, or assistive-technology review for this handover. The application has not been certified against WCAG 2.2 AA. The forest-green, ivory, and antique-gold direction is implemented in the source, but exact pixel-level parity against all approved reference screens is not measured. A human reviewer should attach browser/device/version, width-specific screenshots or notes, keyboard-only results, and screen-reader observations before marking any row above PASS.
