-- Cin7 "White City / Medford" mirrors Stord MEDe001 (stock is moving from
-- Stord into Cin7; the two differ only by sync timing), so counting both
-- double-counted Medford. Stord stays the source for US 3PL stock; Cin7 adds
-- the sites Stord doesn't hold (Harrodsburg, UK, Canada, Australia).
CREATE OR REPLACE FUNCTION dp_location_default(p_source text, p_location text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_source = 'stord' OR p_location IN (
    'Harrodsburg Manufacturing Facility',
    'UK Fulfillment Center (York; 3PL)', 'Canadian Fulfillment Center (3PL)',
    'Australian Fulfillment Center (Sydney; 3PL)')
$$;
SELECT dp_refresh_sku_resolution();
