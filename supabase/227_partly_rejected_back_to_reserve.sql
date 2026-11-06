-- 227: Partly rejected lbs go back on the customer's reserve (Aziz 11/6, Msg #273-274).
--  * A package the driver records as rejected at a Partly rejected stop no longer counts as shipped against the reserve,
--    the same way a fully rejected order (cancelled) already gives its lbs back.
--  * Nothing comes off automatically: if those lbs shouldn't stay with the customer, Sales lowers the reserve by hand.
--  * The reserve shows the rejected lbs in a new "rejected" column. Everything that reads reserves (menu, portal,
--    orderable checks, statements) picks it up. Safe to re-run.
begin;

create or replace view reserve_balances as
WITH sold AS (
         SELECT o.customer_id,
            l.strain,
            l.crop_year,
            sum(l.lbs) FILTER (WHERE o.status = 'shipped'::text) AS shipped,
            sum(l.lbs) FILTER (WHERE o.status = 'pending'::text) AS pending,
            sum(l.lbs) FILTER (WHERE o.status = 'submitted'::text) AS submitted
           FROM orders o
             JOIN order_lines l ON l.order_id = o.id
          WHERE l.product = 'fresh_frozen'::text
          GROUP BY o.customer_id, l.strain, l.crop_year
        ), back AS (
         SELECT r.customer_id,
            lower(rl.strain) AS k,
            rl.crop_year,
            sum(rl.received_lbs) AS returned,
            bool_or(rl.reason = ANY (ARRAY['quality'::text, 'yield'::text])) AS released
           FROM return_orders r
             JOIN return_lines rl ON rl.return_id = r.id
          WHERE r.status <> 'cancelled'::text AND rl.product = 'fresh_frozen'::text
          GROUP BY r.customer_id, (lower(rl.strain)), rl.crop_year
        ), rej AS (
         -- 227: packages rejected at a Partly rejected stop: back on the reserve (Sales takes them off by hand if needed)
         SELECT o.customer_id,
            lower(l.strain) AS k,
            l.crop_year,
            sum(x.lbs) AS rejected
           FROM orders o
             JOIN load_stops st ON st.id = o.stop_id AND st.outcome = 'partly_rejected'::text
             JOIN order_lines l ON l.order_id = o.id AND l.product = 'fresh_frozen'::text
             JOIN order_picks x ON x.order_line_id = l.id
             JOIN pallets p ON p.id = x.pallet_id
          WHERE o.status = 'shipped'::text AND (EXISTS ( SELECT 1
                   FROM stop_returns r
                  WHERE r.stop_id = st.id AND r.kind = 'rejected'::text AND r.cancelled_at IS NULL AND (r.pallet_id = x.pallet_id OR r.pallet_id = p.container_id)))
          GROUP BY o.customer_id, (lower(l.strain)), l.crop_year
        ), b AS (
         SELECT r.id,
            r.customer_id,
            r.strain,
            r.product,
            r.lbs,
            r.notes,
            r.created_by,
            r.created_at,
            r.updated_by,
            r.updated_at,
            r.crop_year,
            r.grade,
            COALESCE(s.shipped, 0::numeric) - COALESCE(k.returned, 0::numeric) - COALESCE(j.rejected, 0::numeric) AS net_shipped,
            COALESCE(j.rejected, 0::numeric) AS rej,
            COALESCE(s.pending, 0::numeric) AS pend,
            COALESCE(s.submitted, 0::numeric) AS subm,
            COALESCE(k.returned, 0::numeric) AS ret,
            COALESCE(k.released, false) AS rel
           FROM reserves r
             LEFT JOIN sold s ON s.customer_id = r.customer_id AND lower(s.strain) = lower(r.strain) AND s.crop_year = r.crop_year
             LEFT JOIN back k ON k.customer_id = r.customer_id AND k.k = lower(r.strain) AND k.crop_year = r.crop_year
             LEFT JOIN rej j ON j.customer_id = r.customer_id AND j.k = lower(r.strain) AND j.crop_year = r.crop_year
          WHERE r.product = 'fresh_frozen'::text
        )
 SELECT id,
    customer_id,
    strain,
        CASE
            WHEN rel THEN LEAST(lbs, GREATEST(net_shipped, 0::numeric) + pend)
            ELSE lbs
        END AS reserved,
    net_shipped AS shipped,
    pend AS pending,
        CASE
            WHEN rel THEN 0::numeric
            ELSE GREATEST(lbs - net_shipped - pend, 0::numeric)
        END AS remaining,
    crop_year,
    subm AS submitted,
    lbs AS original_lbs,
    ret AS returned,
    rel AS released,
    rej AS rejected
   FROM b;

commit;
