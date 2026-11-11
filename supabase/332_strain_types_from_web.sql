-- 332 (Msg TYPE-AUTO-1, 11/10): strain types from online listings (AllBud strain pages, checked by Claude 11/10).
-- 71 strains. Only fills strains whose type is still empty; a type someone already set is left alone.
-- Name matched by id AND name, so a renamed strain is skipped. Autoflower keeps the strain's indica / sativa %.
-- Nothing goes to METRC (330). Safe to re-run.
begin;

with t(id, strain_type, name) as (values
  (57, 'Sativa Hybrid', 'Alcatraz OG'),
  (197, 'Sativa Hybrid', 'Banana Split'),
  (152, 'Sativa Hybrid', 'Golden Goat'),
  (107, 'Sativa Hybrid', 'Super Lemon Haze'),
  (102, 'Sativa Hybrid', 'Tropicanna Cherry'),
  (299, 'Sativa Hybrid', 'Tropicanna Cherry S1'),
  (42, 'Sativa Hybrid', 'Tropicanna Cookies'),
  (144, 'Sativa Hybrid', 'Zushi'),
  (155, 'Sativa Hybrid', 'Mothers Milk'),
  (135, 'Sativa Hybrid', 'Mothers Milk #3'),
  (3, 'Sativa Hybrid', 'Orange Runtz'),
  (41, 'Sativa', 'Sour Diesel (East Coast)'),
  (48, 'Sativa', 'Santa Cruz Blue Dream'),
  (38, 'Hybrid', 'Apple Tartz'),
  (97, 'Hybrid', 'Blue Nerdz'),
  (113, 'Hybrid', 'Banana Punch'),
  (85, 'Hybrid', 'Canal St Runtz'),
  (13, 'Hybrid', 'Cheetah Piss'),
  (148, 'Hybrid', 'E85'),
  (80, 'Hybrid', 'Frozen Banana'),
  (251, 'Hybrid', 'Frozen Bananas'),
  (12, 'Hybrid', 'Governmint Oasis'),
  (43, 'Hybrid', 'Grape Gas'),
  (130, 'Hybrid', 'Honey Banana'),
  (136, 'Hybrid', 'Melted Strawberries'),
  (140, 'Hybrid', 'Moonbow'),
  (53, 'Hybrid', 'Moroccan Peaches'),
  (101, 'Hybrid', 'Peanut Butter Breath'),
  (47, 'Hybrid', 'Rainbow Belts'),
  (186, 'Hybrid', 'Runtz'),
  (98, 'Hybrid', 'White Runtz'),
  (78, 'Hybrid', 'Super Boof'),
  (72, 'Hybrid', 'Its It'),
  (17, 'Hybrid', 'Pink Certz'),
  (46, 'Hybrid', 'Purple Churro'),
  (34, 'Hybrid', 'Pressure'),
  (62, 'Hybrid', 'Sour Strawberry'),
  (288, 'Hybrid', 'Sour Strawberry (DF)'),
  (289, 'Hybrid', 'Sour Strawberry (mixup in Sour Diesel)'),
  (232, 'Indica Hybrid', 'Amaretto Mintz (Mostly Jelly Cake)'),
  (51, 'Indica Hybrid', 'Black Truffle'),
  (116, 'Indica Hybrid', 'Cadillac Rainbows'),
  (71, 'Indica Hybrid', 'Candy Fumez'),
  (60, 'Indica Hybrid', 'Cherry Gusher'),
  (31, 'Indica Hybrid', 'Crumpets'),
  (138, 'Indica Hybrid', 'Dark Rainbow'),
  (19, 'Indica Hybrid', 'Donny Burger'),
  (145, 'Indica Hybrid', 'Dulce de Uva'),
  (15, 'Indica Hybrid', 'Fatso'),
  (50, 'Indica Hybrid', 'Garlic Juice'),
  (146, 'Indica Hybrid', 'GMO'),
  (120, 'Indica Hybrid', 'Godfather OG'),
  (18, 'Indica Hybrid', 'Hashburger'),
  (112, 'Indica Hybrid', 'Jelly Cake'),
  (52, 'Indica Hybrid', 'Key Lime Pie'),
  (111, 'Indica Hybrid', 'Modified Grapes'),
  (133, 'Indica Hybrid', 'Oreoz'),
  (7, 'Indica Hybrid', 'Rainbow Guava'),
  (36, 'Indica Hybrid', 'Vanilla Frosting'),
  (118, 'Indica Hybrid', 'Sherb Creampie'),
  (156, 'Indica Hybrid', 'The Church'),
  (302, 'Indica Hybrid', 'Zerealz'),
  (301, 'Indica Hybrid', 'Wedding Cake'),
  (88, 'Indica Hybrid', 'Tahoe OG'),
  (109, 'Indica', 'Kosher Kush'),
  (90, 'Indica', 'Zkittlez'),
  (231, 'Autoflower', 'Alien OG Auto'),
  (248, 'Autoflower', 'Froot By The Foot Auto'),
  (249, 'Autoflower', 'Froze Auto'),
  (255, 'Autoflower', 'Gas Face Auto'),
  (256, 'Autoflower', 'GMO Auto')
), done as (
  update strains s set strain_type = t.strain_type,
         metrc_indica = coalesce(case t.strain_type when 'Indica' then 100 when 'Indica Hybrid' then 75 when 'Hybrid' then 50 when 'Sativa Hybrid' then 25 when 'Sativa' then 0 end, s.metrc_indica),
         metrc_sativa = coalesce(100 - case t.strain_type when 'Indica' then 100 when 'Indica Hybrid' then 75 when 'Hybrid' then 50 when 'Sativa Hybrid' then 25 when 'Sativa' then 0 end, s.metrc_sativa),
         updated_at = now()
    from t where s.id = t.id and s.name = t.name and s.strain_type is null
  returning s.name, s.strain_type
)
insert into events (user_email, type, note, details)
select 'claude (332)', 'strain_type', name, jsonb_build_object('type', strain_type, 'was', null, 'source', 'AllBud listing, 332') from done;

select strain_type, count(*) from strains where active group by 1 order by 1;
commit;
