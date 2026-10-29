# SAVORÉ Phase 12.1 Manual Browser QA

**Status: PENDING.** HTTP smoke tests passed, but no real browser visual session has completed. Do not mark this checklist complete based on HTTP responses.

## Setup

1. Open the local development site in a working browser and sign in with the local demo accounts already configured for each role. Keep credentials in the local environment; do not paste them into reports.
2. Repeat the checks at **390 × 844** and **1440 × 900**. At each size, inspect horizontal overflow, readable contrast, keyboard focus, navigation, loading/empty states, validation messages, and usable controls.
3. Record each item as Pass, Fail, or Blocked, with the route and a screenshot for every failure.

## Customer

- [ ] `/`, `/menu`, `/menu/[slug]`, `/our-story`, `/experiences/chef-tasting`, `/reservations`
- [ ] `/register`, `/login`, `/account`, `/account/profile`, `/account/favorites`, `/account/reservations`
- [ ] `/cart`, `/order-online`, `/orders/[id]`, `/private-dining`
- [ ] Verify responsive menu cards and forms, validation feedback, cart totals, confirmation states, and customer-owned order/reservation views.

## Host and floor

- [ ] `/staff/host`, `/staff/host/calendar`, `/staff/host/reservations/[id]`
- [ ] `/staff/host/walk-ins`, `/staff/check-in`, `/staff/floor`, `/staff/waitlist`
- [ ] Verify reservation details, date navigation, assignment controls, occupied/free table labels, waitlist actions, confirmation feedback, and mobile table/form usability.

## Waiter

- [ ] `/staff/service`
- [ ] Verify assigned tables, assistance requests, order status, and service actions are readable and current. Confirm unrelated tables are not shown.

## Kitchen

- [ ] `/staff/kitchen` and `/staff/kitchen?page=2` (or the next page shown in the queue)
- [ ] Verify FIFO ordering, previous/next controls, ticket details and allergens, and responsive controls.
- [ ] Advance a ticket through permitted statuses; confirm it leaves the active queue once served or cancelled and other tickets remain in order.

## Administration

- [ ] `/staff/admin`, `/staff/admin/menu`, `/staff/admin/team`, `/staff/admin/reports`, `/staff/admin/settings`, `/staff/admin/audit`
- [ ] Verify KPI labels, tables, filters, forms, charts, export controls, audit readability, confirmation dialogs, and role-restricted navigation.

## QR dining

- [ ] `/staff/qr`; provision or activate an authorized demo table session.
- [ ] Open the generated `/qr/[code]` welcome and menu routes on a 390px viewport.
- [ ] Verify menu, cart/checkout, `/qr/orders/[id]` tracking, assistance controls, and printable QR card at both viewport sizes.

## Access control

- [ ] Repeat staff route checks as host, waiter, chef, manager, and owner. Confirm each role sees only permitted controls and protected routes redirect or deny unauthorized roles.
- [ ] Sign out and verify protected staff routes no longer render operational data.

## Results

| Viewport | Role / workflow | Pass / Fail / Blocked | Route and notes |
|---|---|---|---|
| 390 × 844 |  |  |  |
| 1440 × 900 |  |  |  |
