#!/usr/bin/env python3
"""Build supabase/192_phenohunt26_load.sql from PhenoHunt26_1PN.xlsx (and the 2026 seed project from Seed Project_2026.xlsx).

usage: python3 tools/import_phenohunt26.py PhenoHunt26_1PN.xlsx "Seed Project_2026.xlsx" > supabase/192_phenohunt26_load.sql

What goes in:
- Seed lots: Master List (breeder, plants wanted = Amount, seeds sown = Amount to Sow), plus crosses planted but not on it.
- One hunt "PhenoHunt26 1PN" with every pheno on the Strain Performance Log (cross, hoop, bed, lot tag, cuttings, culled + reason).
  Hoops 3-4 (Heroes of the Farm): the log is partial, so survivors come from the hoops sheet's updated qty (Aziz 11/4).
- 2026 Seed Project: two pollination runs (Rainbow Guava donor, Hashburger donor), donor batches A/B/C. Receivers wait (Aziz 11/4).
- Nursery logs: the Feed Log (with its stock tank mix), Spray Log and Leachate Log.
"""
import collections, datetime as dt, json, re, sys, warnings
import openpyxl
warnings.filterwarnings('ignore')

REF = 'import PhenoHunt26'
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
sp = openpyxl.load_workbook(sys.argv[2], data_only=True)
TAG = '1A406020006AF5500002'

def q(v):
    if v is None or v == '': return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return repr(v)
    if isinstance(v, (dt.date, dt.datetime)): return "'" + v.strftime('%Y-%m-%d') + "'"
    return "'" + str(v).replace("'", "''") + "'"

# ---------- names: one spelling per cross (Violet Torque = Newport Punch #6, Aziz) ----------
FIX = [(r'\s+', ' '), (r'zkittles', 'Zkittlez'), (r'vuittion', 'Vuitton'), (r'\bRoyal Cherry\b', 'Royals Cherry'), (r'^Wilson Zero x', 'Wilson Zero #1 x'),
       (r'Pack Mule 4$', 'Pack Mule #4'), (r'^GMO Cookies x', 'GMO Cookies #2 x'), (r'^MB ?x ?BP x', 'Motorbreath x Banana Punch x'), (r'Bnana', 'Banana'),
       (r'Cookie Burger ?#2', 'Cookie Burger #2'), (r'^8451\b', '8541'), (r'Shufle', 'Shuffle'), (r'^RBB [xX] CS$', 'Rainbow Belts x Cherry Stout'),
       (r'^RBB x', 'Rainbow Belts x'), (r'^SS x Imperial Stout$', 'Scooby Snacks x Imperial Stout'), (r'Lowe Wolf', 'Lone Wolf'), (r'Uncirculate\b', 'Uncirculated'),
       (r'^Lemon Snow Leopard #69 x$', 'Lemon Snow Leopard #69 x Hashburger'), (r'^Newport Punch #6', 'Violet Torque'), (r'Guinnes$', 'Guinness'),
       (r'x\s+Cherry', 'x Cherry')]
def name(s):
    s = str(s).strip()
    for a, b in FIX: s = re.sub(a, b, s, flags=re.I if a == 'zkittles' or a == 'vuittion' else 0)
    return s.strip()
def key(s): return re.sub(r'[^a-z0-9#]', '', name(s).lower())
def split(c):
    parts = c.rsplit(' x ', 1)
    return (parts[0], parts[1]) if len(parts) == 2 else (c, None)

# ---------- seed lots ----------
lots = collections.OrderedDict()
for r in wb['Master List'].iter_rows(min_row=2, values_only=True):
    if r[0] is None or r[3] is None: continue
    c = name(r[0]); unsure = '(?)' in c; c = c.replace('(?)', '').strip()
    lots.setdefault(key(c), dict(cross=c, breeder=str(r[3]).strip().replace('Heroes of The Farm', 'Heroes of the Farm'), target=r[1], sown=r[2],
                                 notes='Marked (?) on the Master List' if unsure else None))

# ---------- hoops sheet rows ----------
hoops = []
for r in wb['Phenon Hunt Hoops 1-7'].iter_rows(min_row=2, values_only=True):
    if not r[0] or r[1] is None: continue
    c = name(r[0]); lot = r[10]; note = r[14] if len(r) > 14 else None
    if not lot and note and str(note).startswith(TAG): lot = note
    hoops.append(dict(cross=c, hoop=int(r[1]), plants=r[2], culled=-(r[3] or 0) if isinstance(r[3], (int, float)) and r[3] < 0 else None, upd=r[4],
                      sown=r[5], planted=r[6], bed=str(r[7]).strip() if r[7] else None, breeder=str(r[9]).strip() if r[9] else None, lot=lot))
    if key(c) not in lots:
        lots[key(c)] = dict(cross=c, breeder=(r[9] or '').strip().replace('Heroes of The Farm', 'Heroes of the Farm'), target=None, sown=None, notes='Planted but not on the Master List')
# METRC (11/4 pull) has these plants under a different immature batch than the sheet says
LOT_FIX = {('Lemon Snow Leopard #69 x Hashburger', 11): TAG + '3413', ('DW x WM x Cherry Stout', 3): TAG + '2646', ('Mulebreath', 11): TAG + '3388'}
for h in hoops:
    if (h['cross'], h['hoop']) in LOT_FIX: h['lot'] = LOT_FIX[(h['cross'], h['hoop'])]
sown_on = {}
for h in hoops: sown_on.setdefault(key(h['cross']), h['sown'])

# ---------- phenos (Strain Performance Log) ----------
def day(v):
    if isinstance(v, dt.datetime): return v if dt.datetime(2026, 7, 1) <= v <= dt.datetime(2026, 11, 30) else None   # 2006/2007 = Excel fill-down junk
    m = re.match(r'^\s*(\d{1,2})/(\d{1,2})/?(\d{4})\s*$', str(v or ''))       # typed as 9/212026 on the sheet
    return dt.datetime(int(m.group(3)), int(m.group(1)), int(m.group(2))) if m else None
log = collections.defaultdict(list)
for r in wb['Strain Performance Log'].iter_rows(min_row=2, values_only=True):
    if not r[0]: continue
    raw = str(r[0]); m = re.match(r'^(.*?)\s*#\s*(\d+)\s*$', raw)
    c, num = (m.group(1), int(m.group(2))) if m else (raw, None)
    c = re.sub(r'^85(4[2-9]|5\d) x Imperial Stout', '8541 x Imperial Stout', c.strip())       # Excel fill-down: 8542.. = 8541
    c = re.sub(r'^84(5[1-9]|[67]\d) x (Head Dog 7|Cherry Stout)', r'8541 x \2', c)
    log[(key(c), int(r[1]))].append(dict(num=num, cut_on=day(r[2]), cut_qty=r[3] if isinstance(r[3], (int, float)) else None,
                                         culled=bool(r[4] and str(r[4]).strip()), reason=str(r[5]).strip().replace('Suceptibility', 'Susceptibility') if r[5] else None))
phenos = []; used = collections.defaultdict(set); notes = []
# log rows whose hoop has no hoops-sheet row for that cross go to the cross's row (the log keeps its own hoop)
byk = collections.defaultdict(list)
for h in hoops: byk[key(h['cross'])].append(h)
assigned = collections.defaultdict(list)
for (k, hp), rows in list(log.items()):
    hit = [h for h in byk.get(k, []) if h['hoop'] == hp] or byk.get(k, [])[:1]
    if not hit: continue
    if hit[0]['hoop'] != hp: notes.append(f"{len(rows)} log rows for {hit[0]['cross']} say hoop {hp}; the hoops sheet has it in hoop {hit[0]['hoop']} (kept hoop {hp})")
    for x in rows: x['hoop'] = hp
    assigned[id(hit[0])].extend(rows); log.pop((k, hp))
for h in hoops:
    k = key(h['cross']); rows = assigned.get(id(h), [])
    for x in rows:
        nums = used[(k, x['hoop'])]
        n = x['num'] if x['num'] and x['num'] not in nums else (max(nums | {0}) + 1)
        if x['num'] and x['num'] != n: notes.append(f"{h['cross']} hoop {x['hoop']}: #{x['num']} is on the log twice, the second one is #{n}")
        nums.add(n)
        phenos.append(dict(k=k, n=n, label=f"{h['cross']} #{n}", hoop=x['hoop'], bed=h['bed'] if x['hoop'] == h['hoop'] else None, lot=h['lot'], planted=h['planted'], cut_on=x['cut_on'], cut_qty=x['cut_qty'],
                           status='culled' if x['culled'] else 'growing', reason=x['reason'] if x['culled'] else None, note=None))
    if h['hoop'] in (3, 4) and h['upd']:                       # Heroes hoops: the hoops sheet count is the survivors
        alive = sum(1 for x in rows if not x['culled'])
        nums = used[(k, h['hoop'])]; top = max([max(v | {0}) for (kk, _), v in used.items() if kk == k] + [0])
        for _ in range(int(h['upd']) - alive):
            top += 1; n = top; nums.add(n)
            phenos.append(dict(k=k, n=n, label=f"{h['cross']} #{n}", hoop=h['hoop'], bed=h['bed'], lot=h['lot'], planted=h['planted'], cut_on=None, cut_qty=None,
                               status='growing', reason=None, note='Survivor from the hoops sheet count (not on the Strain Performance Log)'))
for (k, hp), rows in log.items(): notes.append(f'NOT LOADED: {len(rows)} log rows for {k} hoop {hp} (no hoops sheet row)')

# ---------- output ----------
o = []; w = o.append
w('-- 192: PhenoHunt26 + 2026 Seed Project + Nursery log history. Generated by tools/import_phenohunt26.py from PhenoHunt26_1PN.xlsx and Seed Project_2026.xlsx (11/4).')
w('-- Run after 191. Safe to re-run: stops if the hunt already has scores or observations; otherwise replaces what an earlier run of this file loaded.')
w('set client_min_messages = warning;')
w('do $$ begin if exists (select 1 from pheno_scores s join phenos p on p.id = s.pheno_id where p.import_ref = ' + q(REF) + ') or exists (select 1 from pheno_obs s join phenos p on p.id = s.pheno_id where p.import_ref = ' + q(REF) + ") then raise exception 'PhenoHunt26 already has scores or observations; not reloading'; end if; end $$;")
w('delete from phenos where import_ref = ' + q(REF) + ';')
w('delete from pheno_hunts where import_ref = ' + q(REF) + ';')
w('delete from seed_lots where import_ref = ' + q(REF) + ';')
w('alter table phenos disable trigger phenos_audit; alter table seed_lots disable trigger seed_lots_audit;')
w('insert into seed_lots (code, mother_strain, father_strain, source, breeder, season, target_plants, sown, sown_on, notes, import_ref) values')
vals = []
for k, l in lots.items():
    m, f = split(l['cross']); inh = l['breeder'].lower() == 'lifted'
    vals.append(f"({q(None)}, {q(m)}, {q(f)}, {q('in-house' if inh else 'breeder')}, {q(None if inh else l['breeder'])}, 2026, {q(l['target'])}, {q(l['sown'])}, {q(sown_on.get(k))}, {q(l['notes'])}, {q(REF)})")
w(',\n'.join(vals) + ';')
tot_planted = sum(h['plants'] or 0 for h in hoops)
w(f"insert into pheno_hunts (site, season, name, sown_on, planted_on, seeds_sown, germinated, status, notes, import_ref) values ('1PN', 2026, 'PhenoHunt26 1PN', '2026-07-21', '2026-08-04', "
  f"{sum((l['sown'] or 0) for l in lots.values())}, {tot_planted}, 'growing', {q('Webb hoops 3-11. Lifted, Old Soul Seeds and Genefinder sown 7/21-7/22, planted 8/4; Heroes of the Farm sown 8/5, planted 8/13. Flip about 9/15. Loaded from PhenoHunt26_1PN.xlsx 11/4.')}, {q(REF)});")
# compact: one group per cross+hoop+bed+lot; each pheno is a token  <n>[d<date#>][q<cuttings>][c<reason#>][s]
dates = sorted({p['cut_on'].strftime('%Y-%m-%d') for p in phenos if p['cut_on']})
reasons = sorted({p['reason'] or '' for p in phenos if p['status'] == 'culled'})
groups = collections.OrderedDict()
for p in phenos:
    g = groups.setdefault((p['k'], p['hoop'], p['bed'], p['lot'], p['planted'].strftime('%Y-%m-%d') if p['planted'] else None), [])
    t = str(p['n'])
    if p['cut_on']: t += 'd%d' % dates.index(p['cut_on'].strftime('%Y-%m-%d'))
    if p['cut_qty']: t += 'q%d' % int(p['cut_qty'])
    if p['status'] == 'culled': t += 'c%d' % reasons.index(p['reason'] or '')
    if p['note']: t += 's'
    g.append(t)
js = json.dumps([dict(k=k[0], h=k[1], b=k[2], l=k[3][-6:] if k[3] else None, p=k[4], i=' '.join(v)) for k, v in groups.items()], separators=(',', ':'))
w(f"""with g as (select * from jsonb_to_recordset($j${js}$j$::jsonb) as x(k text, h int, b text, l text, p date, i text)),
     t as (select g.*, tok from g, regexp_split_to_table(g.i, ' ') tok),
     d as (select array[{', '.join(q(x) for x in dates)}]::date[] dates, array[{', '.join(q(x) for x in reasons)}]::text[] reasons),
     x as (select t.k, t.h, t.b, t.l, t.p, (regexp_match(tok, '^([0-9]+)'))[1]::int n, (regexp_match(tok, 'd([0-9]+)'))[1]::int di, (regexp_match(tok, 'q([0-9]+)'))[1]::int cq,
                  (regexp_match(tok, 'c([0-9]+)'))[1]::int ci, tok like '%s' sv from t)
insert into phenos (hunt_id, seed_lot_id, number, label, room_id, bed, lot_tag, planted_on, cut_on, cut_qty, status, cull_reason, notes, import_ref)
select h.id, s.id, x.n, concat_ws(' x ', s.mother_strain, s.father_strain) || ' #' || x.n, r.id, x.b, case when x.l is not null then '{TAG[:-1]}' || x.l end, x.p,
       d.dates[x.di + 1], x.cq, case when x.ci is null then 'growing' else 'culled' end, nullif(d.reasons[x.ci + 1], ''),
       case when x.sv then 'Survivor from the hoops sheet count (not on the Strain Performance Log)' end, '{REF}'
  from x cross join d
  join pheno_hunts h on h.import_ref = '{REF}'
  join seed_lots s on s.import_ref = '{REF}' and regexp_replace(lower(concat_ws(' x ', s.mother_strain, s.father_strain)), '[^a-z0-9#]', '', 'g') = x.k
  left join nursery_rooms r on r.site = '1PN' and r.place = 'Webb' and r.name = 'Hoop ' || x.h;""")
w('alter table phenos enable trigger phenos_audit; alter table seed_lots enable trigger seed_lots_audit;')
w("insert into events (user_email, type, note, details) select current_email(), 'nursery_breed_import', 'PhenoHunt26 1PN loaded', jsonb_build_object('phenos', (select count(*) from phenos where import_ref = '" + REF + "'), 'seed_lots', (select count(*) from seed_lots where import_ref = '" + REF + "'));")

# ---------- 2026 seed project ----------
w("\n-- ---------- 2026 Seed Project: donors in the greenhouse now, to Trailer 3, then into T1 or T2 (receivers to come) ----------")
w("delete from breed_runs where project = '2026 Seed Project' and notes like '[" + REF + "]%' and not exists (select 1 from seed_lots s where s.run_id = breed_runs.id);")
w("delete from breed_donor_batches where project = '2026 Seed Project' and notes like '[" + REF + "]%';")
for donor in ('Rainbow Guava', 'Hashburger'):
    w(f"""insert into breed_runs (site, season, project, name, donor_strain, donor_batch_id, donor_room_id, receivers_cut_on, receivers_planted_on, flip_on, status, notes)
select '1PN', 2026, '2026 Seed Project', '2026 Seed Project · {donor} donor', '{donor}',
       (select id from nursery_batches where strain = '{donor}' and cut_on = '2026-10-11' order by id limit 1),
       (select id from nursery_rooms where site = '1PN' and name = 'Greenhouse'), '2026-10-11', '2026-11-09', '2026-12-02', 'growing',
       '[{REF}] Every receiver gets crossed to both donors. Trailer (T1 or T2) set when the donors move in. Receivers transplant into the receiver trailers 11/9; photoperiod change about 12/2. STS mixes planned 11/19 (sodium thiosulfate + silver nitrate) and 11/22: log them as Spray in Nursery > Logs.'
 where not exists (select 1 from breed_runs where name = '2026 Seed Project · {donor} donor');""")
sch = sp['Schedule']; batches = []
rows = list(sch.iter_rows(min_row=1, values_only=True))
for i, r in enumerate(rows):
    if r[7] and str(r[7]).startswith('Batch '):
        mix = rows[i + 1][7] if i + 1 < len(rows) else None
        batches.append((r[7], r[9], r[8], r[11], r[12], mix))
for lab, n, cut, t3, mv, mix in batches:
    w(f"insert into breed_donor_batches (project, label, strains, plants, cut_on, room_id, to_room_on, move_in_on, notes) values ('2026 Seed Project', {q(lab)}, 'Rainbow Guava / Hashburger', {q(n)}, '2026-10-11', "
      f"(select id from nursery_rooms where site = '1PN' and name = 'Trailer 3'), {q(t3)}, {q(mv)}, '[{REF}] In the greenhouse now; to Trailer 3 on the transplant date. Sheet cut date {cut:%m/%d}; the app''s cutting batches say 10/11.') on conflict (project, label) do nothing;")

# ---------- logs ----------
w("\n-- ---------- Nursery logs from the PhenoHunt26 sheet ----------")
w("insert into input_products (name, manufacturer, full_name, kind, npk, notes) select v.* from (values ('Compost Tea', 'True Organic Products, Inc.', 'TRUE 3-2-2 Liquid Fertilizer', 'Liquid fertilizer', '3-2-2', 'From the PhenoHunt26 product list'),"
  " ('Biomin Boron', 'JH Biotech', 'Biomin Boron', 'Micronutrient', null, 'From the PhenoHunt26 product list'), ('Biomin Molybdenum', 'JH Biotech', 'Biomin Molybdenum', 'Micronutrient', null, 'From the PhenoHunt26 product list')) v(name, manufacturer, full_name, kind, npk, notes)"
  " where not exists (select 1 from input_products p where lower(p.name) = lower(v.name));")
w("delete from ops_logs where module = 'nursery' and notes like '[" + REF + "]%';")
tanks = collections.OrderedDict(); cur = None
for r in wb['StockTankBatches'].iter_rows(min_row=2, values_only=True):
    if not r[3]: continue
    if r[0]: cur = str(r[0]).strip()
    tanks.setdefault(cur, []).append(dict(product=str(r[3]).strip(), manufacturer=r[7], total=r[4], total_unit={'lbs': 'lb'}.get(r[5], r[5]), tank=r[2], mixed_gal=r[6]))
feeds = {}
for r in wb['Feed Log'].iter_rows(min_row=2, values_only=True):
    if r[0] in tanks:
        if r[1]: feeds.setdefault('date', r[1]); feeds.setdefault('min', r[2])
        feeds.setdefault('ids', []).append(str(r[0]))
if feeds:
    prods = [dict(p, notes=f"{p['tank']} tank {p['mixed_gal'] or ''} gal mix".replace('  ', ' ')) for i in feeds['ids'] for p in tanks[i]]
    for p in prods: p.pop('tank'); p.pop('mixed_gal')
    w(f"insert into ops_logs (module, kind, site, area, log_on, method, run_min, products, notes) values ('nursery', 'feed', '1PN', 'Webb hoops 3-11', {q(feeds['date'])}, 'Fertigation', {q(feeds['min'])}, {q(json.dumps(prods))}::jsonb, "
      f"{q('[' + REF + '] Stock tank batch PH-10 (' + ', '.join(feeds['ids']) + '), mixed 10/5. Total applied not recorded.')});")
sprays = []; cur = None
for r in wb['Spray Log'].iter_rows(min_row=2, values_only=True):
    if r[0]: cur = dict(date=r[0], start=r[1], end=r[2], area=r[3], sqft=r[4], type=r[5], water=r[6], who=r[13], notes=r[14], products=[]); sprays.append(cur)
    if cur and r[7]:
        rate = r[8]; water = cur['water'] or 0
        cur['products'].append(dict(product=str(r[7]).strip(), rate=rate, unit=f"{r[9]}/Gal", total=(rate * water) if isinstance(rate, (int, float)) and water else None, total_unit=r[9]))
for s in sprays:
    w(f"insert into ops_logs (module, kind, site, area, log_on, start_at, end_at, sqft, spray_type, water_gal, applicator, products, notes) values ('nursery', 'spray', '1PN', {q(s['area'])}, {q(s['date'])}, "
      f"{q(s['start'].strftime('%H:%M') if s['start'] else None)}, {q(s['end'].strftime('%H:%M') if s['end'] else None)}, {q(s['sqft'])}, {q(s['type'])}, {q(s['water'])}, {q(s['who'])}, {q(json.dumps(s['products']))}::jsonb, {q('[' + REF + ']' + (' ' + s['notes'] if s['notes'] else ''))});")
def num(v):
    if v is None: return None
    if isinstance(v, (int, float)): return v
    m = re.search(r'-?\d+(\.\d+)?', str(v)); return float(m.group()) if m else None
w("delete from nursery_leachate where source = " + q(REF) + ";")
lv = []
for r in wb['Leachate Log'].iter_rows(min_row=4, values_only=True):
    if r[0] is None or r[1] is None or not isinstance(r[1], (dt.date, dt.datetime)): continue
    room = 'Greenhouse' if str(r[0]).strip().upper() == 'GH' else f'Hoop {int(r[0])}'
    vals = [num(r[i]) if i < len(r) else None for i in range(2, 15)]
    lv.append(f"((select id from nursery_rooms where site = '1PN' and name = {q(room)}), {q(r[1])}, " + ', '.join(q(v) for v in vals[:11]) + f", {q(vals[11])}, {q(vals[12])}, {q(r[16] if len(r) > 16 else None)}, {q(REF)})")
w('insert into nursery_leachate (room_id, taken_on, minutes, leach_vol, leach_ec, leach_ph, front_ml, front_ec, front_ph, back_ml, back_ec, back_ph, water_ml_plant, expect_pct, leach_pct, notes, source) values\n' + ',\n'.join(lv) + ';')

w(f"""select (select count(*) from seed_lots where import_ref = '{REF}') as seed_lots, (select count(*) from phenos where import_ref = '{REF}') as phenos,
       (select count(*) from phenos where import_ref = '{REF}' and status = 'culled') as culled, (select count(*) from breed_runs where project = '2026 Seed Project') as runs,
       (select count(*) from breed_donor_batches where project = '2026 Seed Project') as donor_batches,
       (select count(*) from ops_logs where notes like '[{REF}]%') as logs, (select count(*) from nursery_leachate where source = '{REF}') as leachate;""")
print('\n'.join(o))
print(f'-- {len(lots)} seed lots, {len(phenos)} phenos ({sum(p["status"] == "culled" for p in phenos)} culled), {len(lv)} leachate rows', file=sys.stderr)
for n in notes: print('-- ' + n, file=sys.stderr)
