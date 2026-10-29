# Phase 12.2 Manual Browser QA

Status: **Pending human browser review.** The 390px, 768px and 1440px visual reviews are a Phase 12.5 client-demo acceptance requirement. Automated browser tooling is not available in this environment. Do not mark a row complete from HTTP status checks alone.

Execution limitation recorded for Phase 12.2.1: no Edge, Chrome or Chromium executable was resolved on PATH, and the repository has neither Playwright nor Puppeteer installed. A prior headless Edge attempt failed during GPU initialization. No browser or automation package was installed for this review. The HTTP checks below validate routing and asset delivery only; the viewport and visual checks remain pending.

The historical QR development HTML-response issue remains unresolved at its original root-cause level, but is currently non-reproducible: the Phase 11.3 suite passed against both a fresh isolated development server and the production server during Phase 12.2.1 validation. Keep monitoring it during the client-demo browser review.

## Viewports

- [ ] Mobile: 390 × 844 CSS px
- [ ] Tablet: 768 × 1024 CSS px
- [ ] Desktop: 1440 × 900 CSS px

At each width, check for horizontal page overflow, cropped content, readable contrast, visible keyboard focus, reachable controls, touch target spacing, and image loading. Where a remote image fails, verify the branded image fallback preserves the card dimensions and does not display a broken-image icon or raw alt text. Confirm the forest green `#16382D`, champagne ivory `#F5F0E6`, antique gold `#C49A5A`, espresso `#30241F`, and copper `#A65D48` remain consistent.

## Customer pages and imagery

- [ ] `/` — hero, dining-room image, menu cards, navigation, footer.
- [ ] `/menu` and a dish detail — card image, pricing, badges, details and favorites action.
- [ ] `/experiences/chef-tasting` — hero and experience imagery.
- [ ] `/our-story` — story image and text layout.
- [ ] `/gallery` — verify image cards align; specifically inspect the local seasonal ingredients illustration, its explicit illustration caption, and the fallback state for an unavailable external image.
- [ ] `/private-dining` — form fields, validation messages, submit/loading state.
- [ ] `/reservations` — date, party size, availability, validation and confirmation states.
- [ ] `/order-online`, `/cart`, `/orders/[id]` — item imagery, quantities, totals, checkout and tracking.
- [ ] `/account`, `/account/favorites`, `/account/profile`, `/account/reservations` — empty and populated states, ownership-scoped data.

## Reception and floor operations

- [ ] `/staff/host` and `/staff/host/calendar` — date navigation, day/week layout, booking details and status filters.
- [ ] `/staff/host/walk-ins`, `/staff/check-in`, `/staff/waitlist` — form controls, transitions, empty/loading/error states and confirmation dialogs.
- [ ] `/staff/floor` — table labels, zone layout, occupancy, reservation assignment and narrow-screen usability.
- [ ] `/staff/service` — waiter sees assigned tables and assistance requests only.

## Kitchen and administration

- [ ] `/staff/kitchen` — FIFO ordering, next/previous pagination beyond 100 tickets, status updates and no duplicate/missing tickets on page changes.
- [ ] `/staff/orders` — order detail and role-restricted actions.
- [ ] `/staff/admin`, `/staff/admin/menu`, `/staff/admin/team`, `/staff/admin/reports`, `/staff/admin/settings`, `/staff/admin/audit` — data tables, pagination, forms, validation, CSV export, chart labels, confirmation dialogs and mobile access.
- [ ] Verify restricted roles receive the expected redirect or denial and cannot see links or data outside their role.

## QR dining

- [ ] `/staff/qr` — provisioned tables, active sessions, QR card and print dialog.
- [ ] `/qr/[code]` and `/qr/[code]/menu` — welcome screen, menu imagery, filters, allergen labels, cart bar and 390px layout.
- [ ] Place a demo order; verify `/qr/orders/[id]` tracking and kitchen status updates.

Record browser/version, date, viewport, account role, route, and any defect with a screenshot before marking a check complete. The original 51-screen design references were not present in the repository, so exact design parity cannot be assessed from this checklist.
