export const FREEZER_STATUSES = ['On', 'Off', 'Needs Attention', 'Not Working'];
export const PRODUCT_LABEL = { fresh_frozen: 'Fresh Frozen', wet: 'Wet (raw)', unbucked: 'Unbucked', bucked: 'Bucked', bucked_standards: 'Bucked Standards', standards: 'Standards', smalls: 'Smalls', trim: 'Trim', dry_biomass: 'Dry Biomass' };
export const PRODUCT_SHORT = { fresh_frozen: 'FF', wet: 'Wet', unbucked: 'Unbk', bucked: 'Bkd', bucked_standards: 'BkStd', standards: 'Std', smalls: 'Sml', trim: 'Trim', dry_biomass: 'Bio' };
/** products Sales can put on an order line */
export const SALE_PRODUCTS = ['fresh_frozen', 'standards', 'smalls', 'trim', 'bucked', 'unbucked', 'dry_biomass'];
export const FINISH_LABEL = { FF: 'Fresh Frozen', DH: 'Wet', UF: 'Unbucked', BF: 'Bucked', ST: 'Standards', SM: 'Smalls', TR: 'Trim', BT: 'Bucking trim', DB: 'Dry biomass', DS: 'Dry sift biomass', CL: 'Clone', UR: 'Unrooted cutting', IP: 'Immature plant', MS: 'Mother stock', SD: 'Seed' };
export const MODULES = [
    { key: 'distribution', label: 'Distribution', what: 'Freezer map, transit, review', user: 'Move, split, load and ship pallets', admin: '+ Distribution settings (vehicles, strains)' },
    { key: 'sales', label: 'Sales', what: 'Reserves, open menu, orders, prices', user: 'See prices, reserves and orders; confirm orders', admin: '+ approve reserve requests, deadlines, customers and terms' },
    { key: 'cultivation', label: 'Cultivation', what: 'Harvest schedule, testing, fields, planning', user: 'Schedule and log harvests, fields, plan', admin: '+ Cultivation settings (sites, fields, labs, equipment)' },
    { key: 'nursery', label: 'Nursery', what: 'Mother plants, cuttings, clone orders and deliveries', user: 'Mothers, batches, deliver clones, invoices', admin: '+ Nursery settings (rooms, prices, tag ranges); void invoices' },
    { key: 'processing', label: 'Processing', what: 'Dry flower: drying, bucking, trimming, crew pay', user: 'Wet packages, send out / receive, bucking and trimming runs, commit to orders', admin: '+ Processing settings (processors)' },
    { key: 'accounting', label: 'Accounting', what: 'Invoices to QuickBooks, payments, classes', user: 'Check and send invoices to QuickBooks', admin: '+ connect QuickBooks, products, classes and class rules' },
    { key: 'compliance', label: 'Compliance', what: 'METRC, CCOF, document library, deadlines', user: 'Add documents, check off METRC work, deadlines, CCOF materials, reconcile', admin: '+ Compliance settings (document types, SharePoint backup)' },
    { key: 'admin', label: 'Admin', what: 'Company dashboard, users and access, app settings', user: 'Everything in Admin', admin: 'Everything in Admin' },
];
/** before 023 is run: work it out from the old role */
export function accessFromRole(role, extra = []) {
    const m = {};
    if (role === 'admin') {
        m.distribution = 'admin';
        m.sales = 'admin';
        m.admin = 'admin';
    }
    if (role === 'sales') {
        m.distribution = 'user';
        m.sales = 'user';
    }
    if (role === 'crew')
        m.distribution = 'user';
    if (['admin', 'sales', 'crew'].includes(role) && extra.includes('cultivation'))
        m.cultivation = role === 'admin' ? 'admin' : 'user';
    return { owner: false, modules: m, prefs: {} };
}
export const canSales = (r) => r === 'admin' || r === 'sales';
