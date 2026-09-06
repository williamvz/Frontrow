// The competitions Frontrow knows about. `espn_slug` is the path segment in
// site.api.espn.com/apis/site/v2/sports/soccer/<slug>/…; `sportsdb_id` is
// TheSportsDB's league id, used by the fallback provider.
//
// Adding a competition is a matter of adding a row here and listing its id in
// the add-on's `competitions` option — nothing else in the codebase changes.

export const COMPETITIONS = [
  {
    id: 'eredivisie',
    name_nl: 'Eredivisie', name_en: 'Eredivisie', short_name: 'Eredivisie', abbr: 'ERE',
    country: 'NL', kind: 'league', tier: 1, has_table: 1,
    accent: '#E4002B', espn_slug: 'ned.1', sportsdb_id: '4337', sort_order: 10,
  },
  {
    id: 'kkd',
    name_nl: 'Keuken Kampioen Divisie', name_en: 'Eerste Divisie', short_name: 'KKD', abbr: 'KKD',
    country: 'NL', kind: 'league', tier: 2, has_table: 1,
    accent: '#00A94F', espn_slug: 'ned.2', sportsdb_id: '4478', sort_order: 20,
  },
  {
    id: 'knvb_beker',
    name_nl: 'KNVB Beker', name_en: 'KNVB Cup', short_name: 'KNVB Beker', abbr: 'BEK',
    country: 'NL', kind: 'cup', tier: null, has_table: 0,
    accent: '#F5A623', espn_slug: 'ned.cup', sportsdb_id: '4707', sort_order: 30,
  },
  {
    id: 'johan_cruijff_schaal',
    name_nl: 'Johan Cruijff Schaal', name_en: 'Johan Cruijff Shield', short_name: 'JC Schaal', abbr: 'JCS',
    country: 'NL', kind: 'supercup', tier: null, has_table: 0,
    accent: '#C8A951', espn_slug: 'ned.supercup', sportsdb_id: '4880', sort_order: 40,
  },
  {
    id: 'oranje',
    name_nl: 'Nederlands elftal', name_en: 'Netherlands', short_name: 'Oranje', abbr: 'NED',
    country: 'NL', kind: 'international', tier: null, has_table: 0,
    accent: '#FF6B00', espn_slug: null, sportsdb_id: null, sort_order: 5,
  },

  // --- not enabled by default; flip them on in the add-on options -----------
  {
    id: 'ucl', name_nl: 'Champions League', name_en: 'Champions League', short_name: 'Champions League', abbr: 'UCL',
    country: 'EU', kind: 'league', tier: null, has_table: 1,
    accent: '#0B1A5B', espn_slug: 'uefa.champions', sportsdb_id: '4480', sort_order: 50, enabled: 0,
  },
  {
    id: 'uel', name_nl: 'Europa League', name_en: 'Europa League', short_name: 'Europa League', abbr: 'UEL',
    country: 'EU', kind: 'league', tier: null, has_table: 1,
    accent: '#FF6900', espn_slug: 'uefa.europa', sportsdb_id: '4481', sort_order: 60, enabled: 0,
  },
  {
    id: 'uecl', name_nl: 'Conference League', name_en: 'Conference League', short_name: 'Conference League', abbr: 'UECL',
    country: 'EU', kind: 'league', tier: null, has_table: 1,
    accent: '#00B94F', espn_slug: 'uefa.europa.conf', sportsdb_id: '5071', sort_order: 70, enabled: 0,
  },
  {
    id: 'eredivisie_vrouwen',
    name_nl: 'Eredivisie Vrouwen', name_en: "Women's Eredivisie", short_name: 'Eredivisie Vrouwen', abbr: 'EDV',
    country: 'NL', kind: 'league', tier: 1, has_table: 1,
    accent: '#E4002B', espn_slug: 'ned.w.1', sportsdb_id: null, sort_order: 80, enabled: 0,
  },
];

export default COMPETITIONS;
