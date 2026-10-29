# SAVORÉ Phase 12.5 visual acceptance checklist

Status: **pending human or working browser acceptance**. No browser automation or approved client-reference screenshots were available during preparation. Do not mark these items complete based on HTTP tests or source review.

Run these commands in PowerShell from the repository root:

```powershell
npm.cmd run demo:prepare
npm.cmd run demo:verify
npm.cmd run demo:start
```

Keep the server terminal open. In a normal browser, open `http://127.0.0.1:3015`. To review a role, use its fictional email in the table below and retrieve that account's generated password locally from the ignored `.env.client-demo` using your approved secure access method. Do not paste passwords or QR tokens into notes, screenshots, chat, or this checklist. Sign out before changing roles. Stop the server with Ctrl+C when finished.

For each area below, use browser developer tools' responsive device mode and set the viewport to **390px**, **768px**, then **1440px**. At each width check horizontal overflow, typography/readability, contrast, touch target sizes, visible and unclipped keyboard focus, image loading/fallbacks, navigation, validation feedback, empty/loading states, and role-restricted navigation. This checklist is a manual procedure; HTTP smoke checks do not count as visual acceptance.

| Area | Pages and interactions | 390px | 768px | 1440px |
|---|---|---|---|---|
| Customer | Home, menu, dish details, profile, favorites, reservation form and confirmation, cart/checkout, order tracking | ☐ | ☐ | ☐ |
| Host | Dashboard, reservation calendar/detail/edit, walk-in, waitlist, check-in | ☐ | ☐ | ☐ |
| Floor | Floor plan, table detail/occupancy, status refresh | ☐ | ☐ | ☐ |
| Waiter | Service board, assigned tables, assistance and dining progress | ☐ | ☐ | ☐ |
| Kitchen | Active ticket list, pagination, status transitions, update announcements | ☐ | ☐ | ☐ |
| Administration | Admin dashboard, menu/staff management, reports/CSV, settings, audit logs | ☐ | ☐ | ☐ |
| QR dining | T03 guest welcome, menu, cart, checkout, order tracking, assistance | ☐ | ☐ | ☐ |

## Manual interaction steps

1. **Customer:** open menu and a dish detail; add/remove a favorite; submit one reservation and confirm it appears in the account. Add a menu item to cart, inspect checkout and order tracking. Do not submit a payment; payments are simulated.
2. **Host:** open today's dashboard and calendar; find the customer reservation; inspect details, check-in and assign a suitable table. Review the floor plan, then inspect the waitlist and walk-in form. Avoid cancelling or deleting shared fixtures.
3. **Waiter:** open the service board and assigned table; inspect assistance and dining-progress controls. Verify the seeded occupied table is visible.
4. **Chef:** open the kitchen queue, move a demo ticket through permitted states, and inspect pagination. Verify completed/cancelled tickets leave the active queue.
5. **Manager and owner:** review dashboard KPI labels, menu/staff management, reservation/order reports, CSV export, settings and audit logs. Check role-restricted navigation and verify customer data is absent where unauthorized.
6. **QR dining:** use the seeded T03 guest QR route from the local ignored demo configuration, open menu/cart/tracking and assistance. Never include the raw token in screenshots or notes.
7. Test both keyboard and pointer input. Tab through links, forms, dialogs, table controls, and status buttons; verify focus is visible and follows a sensible order.
8. Submit invalid and valid forms. Confirm field-level errors are readable and announced, and successful changes persist after refresh.
9. Confirm staff dashboards refresh after a reservation, seating, or kitchen status change in another role's session.
10. Check charts, data tables, and CSV download controls at narrow widths. Confirm no sensitive customer or account data appears outside the authorized role.
11. Scan the local QR with a device on the same machine or enter the local loopback URL manually. A physical phone cannot generally reach another computer's loopback address; do not expose the development server to the LAN just for this check.
12. Compare screenshots with approved SAVORÉ client references when they are supplied. Record browser/version, viewport, role, route, result, and any screenshot filename for each defect.

## Acceptance record

Reviewer: ____________________  Date: ____________________

Browser/version: ____________________  Device/OS: ____________________

Approved visual reference/version: ____________________

Outstanding defects and evidence: ________________________________________________

Keyboard and screen-reader review: **pending**. WCAG 2.2 AA conformance is not claimed.
