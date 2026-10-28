-- Additive order workflow hardening. Existing Phase 10 rows are preserved.
ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "allergenSnapshot" JSONB;
ALTER TABLE "Refund" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "OrderEvent" ADD COLUMN "metadata" JSONB;

CREATE UNIQUE INDEX "Order_guestProfileId_idempotencyKey_key"
  ON "Order" ("guestProfileId", "idempotencyKey");
CREATE UNIQUE INDEX "KitchenTicket_orderId_key" ON "KitchenTicket" ("orderId");
CREATE UNIQUE INDEX "KitchenTicketItem_kitchenTicketId_orderItemId_key"
  ON "KitchenTicketItem" ("kitchenTicketId", "orderItemId");
CREATE UNIQUE INDEX "Refund_requestKey_key" ON "Refund" ("requestKey");
ALTER TABLE "OrderItem" ADD CONSTRAINT "order_item_quantity_positive"
  CHECK ("quantity" > 0 AND "unitPriceMinor" >= 0 AND "lineTotalMinor" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT "order_amounts_nonnegative"
  CHECK ("subtotalMinor" >= 0 AND "taxMinor" >= 0 AND "totalMinor" >= 0);

-- Event rows are an audit trail: application roles may append, never rewrite history.
CREATE OR REPLACE FUNCTION savore_reject_order_event_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'OrderEvent history is immutable';
END;
$$;
CREATE TRIGGER "OrderEvent_immutable"
  BEFORE UPDATE OR DELETE ON "OrderEvent"
  FOR EACH ROW EXECUTE FUNCTION savore_reject_order_event_mutation();
