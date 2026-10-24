-- The first inventory sync (24 Oct) dated Cin7 stock with the run date, but that
-- Cin7 data was last loaded into the warehouse on 22 Oct. Snapshots are now dated
-- by the warehouse load; drop the mislabelled first run so history isn't doubled.
DELETE FROM wh_inventory_snapshot WHERE source = 'cin7' AND snapshot_date = '2026-10-24' AND synced_at < '2026-10-25';
