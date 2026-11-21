-- Backwards compatible: yes. One index only: no table, column, function, trigger, policy or grant changes.
--
-- The travelling card (launch key card_travel, docs/product/travelling-card-2026-11-21, Part 1). A card that travels
-- keeps its journey in Mail.mail_extracted.card.travel, written by the server only; no new table. This index finds a
-- journey's cards without a scan (services/cardTravel journeyRows, the public journey page, the morning run). It is
-- partial, so it holds only travelling cards and costs nothing for any other mail. Built without blocking writes.
CREATE INDEX CONCURRENTLY IF NOT EXISTS mail_card_travel_journey_idx
  ON public."Mail" ((mail_extracted->'card'->'travel'->>'journey'))
  WHERE mail_extracted->'card'->'travel' IS NOT NULL;
