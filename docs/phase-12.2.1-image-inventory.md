# Phase 12.2.1 Image Inventory and QA

All remote image providers remain unverified from this environment. The shell could not establish external TLS connections, and no licensed source files were supplied for local replacement. External URLs therefore remain optional presentation assets; `ResilientImage` replaces failed or missing content with the SAVORÉ forest and ivory fallback frame without rendering a broken-image icon or displaying alt text as fallback copy.

| Page or feature | Source and usage | Expected dimensions | Failure behavior |
| --- | --- | --- | --- |
| Homepage hero and dining-room panels | `/images/savore-dining-room.png`, local decorative CSS backgrounds and intro image | 1536 × 1024 px source; cover crop | Verified local file and MIME in both modes. CSS background remains on forest/ivory surface if unavailable. Intro image uses accessible image fallback. |
| Homepage dish cards | Menu item `imageUrl`, otherwise existing Unsplash sample URLs | 1000 px requested width; card crop | Branded accessible fallback through `ResilientImage`. |
| Gallery | Local dining-room PNG; `/images/seasonal-ingredients.svg`; four existing Unsplash URLs | PNG 1536 × 1024; SVG viewBox 1200 × 800; remote URLs request 1200 px | Branded fallback for failed image loads. Figure grid spans are applied to figures so fallback frames retain the same dimensions. |
| Menu list | Menu item `imageUrl`, otherwise existing Unsplash sample URLs | 1000 px requested width; 300 px card frame | Branded accessible fallback. |
| Dish detail | Menu item `imageUrl`, otherwise existing Unsplash URL | 1400 px requested width; responsive detail frame | Branded accessible fallback. |
| Customer favorites | Menu item `imageUrl` from database | Database supplied; card frame | Missing or failed image shows the same branded fallback. |
| Online ordering | Menu item `imageUrl` from database | Database supplied; 300 px card frame | Missing or failed image shows the same branded fallback. |
| QR menu | Menu item `imageUrl` from database | Database supplied; 210 px card frame | Missing or failed image shows the same branded fallback; no unrelated dining-room photo is substituted for a dish. |
| Private dining and chef experience | Shared local dining-room PNG in CSS backgrounds | 1536 × 1024 px source; cover crop | Verified local asset; CSS falls back to the section's designed background color. No external photo is referenced here. |
| Printed staff QR card | QR code data URI generated for the current table identity | Intrinsic QR output; displayed at print-card size | Not a third-party image. Existing descriptive alt text remains on the QR itself. |

The seasonal SVG is a 1200 × 800 illustration with SVG `role="img"`, title and description. Its accessible text and visible caption explicitly identify it as an illustration. It is rendered with `object-fit: contain` on an ivory surface to retain its full composition. The gallery note says all content is demonstration imagery and does not depict verified SAVORÉ restaurant scenes.

## Verification record

- Local dining-room PNG: 1536 × 1024, 1,944,954 bytes; previous development and production checks returned HTTP 200 with `image/png`.
- Seasonal illustration: viewBox `0 0 1200 800`, title/description present; previous development and production checks returned HTTP 200 with `image/svg+xml`.
- External image availability and rights: not verified. No external assets were downloaded or added.
- Browser visual review: pending. See [the manual visual QA checklist](phase-12.2-manual-visual-qa.md) for mobile 390 px, tablet 768 px and desktop 1440 px review steps.

## Isolated test data cleanup plan (not executed)

No manual cleanup of prior or failed test fixtures was run; successful suites used their own run-scoped cleanup. Preserve all five reservations with active orders, all additional active QR-test reservations, their orders, tickets, dining sessions, occupancies, guest tokens and assistance/audit events. If cleanup is later authorized, first query by exact Phase 11.3 test-run provenance and explicit IDs, inspect every relation, and separate fixtures with active orders from no-order fixtures. For active orders, a manager must move `PLACED → ACCEPTED`, a chef must move `ACCEPTED → PREPARING → READY`, and a manager must move `READY → SERVED`; then a host or manager may complete the associated seated reservation through the authorized status API to release occupancy. Keep audit/event records unless a separately reviewed retention policy permits removal. No direct deletes, cascades, status forcing, table truncation or database reset are part of this plan.
