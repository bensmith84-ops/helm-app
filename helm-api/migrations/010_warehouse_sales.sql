-- Daily sales, SKU sales and ad spend copied from the warehouse by /warehouse-sync.
CREATE TABLE IF NOT EXISTS wh_orders_daily (
  org_id       uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  date         date NOT NULL,
  country      text NOT NULL,
  channel      text NOT NULL,   -- web | amazon_mcf | tiktok | draft | other (Shopify source_name)
  order_type   text NOT NULL,   -- new_subscription | recurring | one_time
  orders       integer, customers integer,
  gross_sales  numeric, discounts numeric, refunds numeric, tax numeric, net_revenue numeric,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, date, country, channel, order_type)
);
CREATE TABLE IF NOT EXISTS wh_sku_sales_daily (
  org_id       uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  date         date NOT NULL,
  channel      text NOT NULL,   -- shopify | amazon
  country      text NOT NULL,
  sku          text NOT NULL,
  product_name text,
  units        numeric, orders integer, gross_revenue numeric, discounts numeric,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, date, channel, country, sku)
);
CREATE TABLE IF NOT EXISTS wh_ad_spend_daily (
  org_id       uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  date         date NOT NULL,
  country      text NOT NULL,
  total_spend  numeric,
  spend        jsonb NOT NULL,  -- every ad_spend_360_by_country column, by channel and product line
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, date, country)
);
DO $p$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['wh_orders_daily', 'wh_sku_sales_daily', 'wh_ad_spend_daily'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'org_iso_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (org_id = active_org())', 'org_iso_' || t, t);
    END IF;
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON %I TO authenticated', t);
  END LOOP;
END $p$;
