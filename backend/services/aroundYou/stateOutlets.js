/**
 * Each state's capitol outlet: the newsroom that covers its state government, from States Newsroom's own list on
 * statesnewsroom.com (39 of its own, 11 partners; read 2026-11-24). Every feed below answered through the fetch guard
 * that day with stories from the last week. All are free to read. The source finder proposes the region's state outlet
 * first, with no Claude call; piece 2's "Across <State>" reads the rows it makes (`rss:state_<xx>`).
 */

const STATE_OUTLETS = Object.freeze({
  AL: { name: 'Alabama Reflector', feed: 'https://alabamareflector.com/feed/' },
  AK: { name: 'Alaska Beacon', feed: 'https://alaskabeacon.com/feed/' },
  AZ: { name: 'Arizona Mirror', feed: 'https://azmirror.com/feed/' },
  AR: { name: 'Arkansas Advocate', feed: 'https://arkansasadvocate.com/feed/' },
  CA: { name: 'CalMatters', feed: 'https://calmatters.org/feed/' },
  CO: { name: 'Colorado Newsline', feed: 'https://coloradonewsline.com/feed/' },
  CT: { name: 'CT Mirror', feed: 'https://ctmirror.org/feed/' },
  DE: { name: 'Spotlight Delaware', feed: 'https://spotlightdelaware.org/feed/' },
  FL: { name: 'Florida Phoenix', feed: 'https://floridaphoenix.com/feed/' },
  GA: { name: 'Georgia Recorder', feed: 'https://georgiarecorder.com/feed/' },
  HI: { name: 'Honolulu Civil Beat', feed: 'https://www.civilbeat.org/feed/' },
  ID: { name: 'Idaho Capital Sun', feed: 'https://idahocapitalsun.com/feed/' },
  IL: { name: 'Capitol News Illinois', feed: 'https://capitolnewsillinois.com/feed/' },
  IN: { name: 'Indiana Capital Chronicle', feed: 'https://indianacapitalchronicle.com/feed/' },
  IA: { name: 'Iowa Capital Dispatch', feed: 'https://iowacapitaldispatch.com/feed/' },
  KS: { name: 'Kansas Reflector', feed: 'https://kansasreflector.com/feed/' },
  KY: { name: 'Kentucky Lantern', feed: 'https://kentuckylantern.com/feed/' },
  LA: { name: 'Louisiana Illuminator', feed: 'https://lailluminator.com/feed/' },
  ME: { name: 'Maine Morning Star', feed: 'https://mainemorningstar.com/feed/' },
  MD: { name: 'Maryland Matters', feed: 'https://marylandmatters.org/feed/' },
  MA: { name: 'CommonWealth Beacon', feed: 'https://commonwealthbeacon.org/feed/' },
  MI: { name: 'Michigan Advance', feed: 'https://michiganadvance.com/feed/' },
  MN: { name: 'Minnesota Reformer', feed: 'https://minnesotareformer.com/feed/' },
  MS: { name: 'Mississippi Today', feed: 'https://mississippitoday.org/feed/' },
  MO: { name: 'Missouri Independent', feed: 'https://missouriindependent.com/feed/' },
  MT: { name: 'Daily Montanan', feed: 'https://dailymontanan.com/feed/' },
  NE: { name: 'Nebraska Examiner', feed: 'https://nebraskaexaminer.com/feed/' },
  NV: { name: 'Nevada Current', feed: 'https://nevadacurrent.com/feed/' },
  NH: { name: 'New Hampshire Bulletin', feed: 'https://newhampshirebulletin.com/feed/' },
  NJ: { name: 'New Jersey Monitor', feed: 'https://newjerseymonitor.com/feed/' },
  NM: { name: 'Source New Mexico', feed: 'https://sourcenm.com/feed/' },
  NY: { name: 'New York Focus', feed: 'https://nysfocus.com/feed/' },
  NC: { name: 'NC Newsline', feed: 'https://ncnewsline.com/feed/' },
  ND: { name: 'North Dakota Monitor', feed: 'https://northdakotamonitor.com/feed/' },
  OH: { name: 'Ohio Capital Journal', feed: 'https://ohiocapitaljournal.com/feed/' },
  OK: { name: 'Oklahoma Voice', feed: 'https://oklahomavoice.com/feed/' },
  OR: { name: 'Oregon Capital Chronicle', feed: 'https://oregoncapitalchronicle.com/feed/' },
  PA: { name: 'Pennsylvania Capital-Star', feed: 'https://penncapital-star.com/feed/' },
  RI: { name: 'Rhode Island Current', feed: 'https://rhodeislandcurrent.com/feed/' },
  SC: { name: 'SC Daily Gazette', feed: 'https://scdailygazette.com/feed/' },
  SD: { name: 'South Dakota Searchlight', feed: 'https://southdakotasearchlight.com/feed/' },
  TN: { name: 'Tennessee Lookout', feed: 'https://tennesseelookout.com/feed/' },
  // The site's own /feed/ redirects here, to another host the fetcher would not follow.
  TX: { name: 'The Texas Tribune', feed: 'https://feeds.texastribune.org/feeds/main/' },
  UT: { name: 'Utah News Dispatch', feed: 'https://utahnewsdispatch.com/feed/' },
  VT: { name: 'VTDigger', feed: 'https://vtdigger.org/feed/' },
  VA: { name: 'Virginia Mercury', feed: 'https://virginiamercury.com/feed/' },
  WA: { name: 'Washington State Standard', feed: 'https://washingtonstatestandard.com/feed/' },
  WV: { name: 'West Virginia Watch', feed: 'https://westvirginiawatch.com/feed/' },
  WI: { name: 'Wisconsin Examiner', feed: 'https://wisconsinexaminer.com/feed/' },
  WY: { name: 'WyoFile', feed: 'https://wyofile.com/feed/' },
});

/** The state's capitol outlet ({ name, feed }), or null. `state` is the two-letter code. */
function stateOutlet(state) {
  return STATE_OUTLETS[String(state || '').trim().toUpperCase()] || null;
}

module.exports = { STATE_OUTLETS, stateOutlet };
