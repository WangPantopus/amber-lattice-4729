'use strict';

/**
 * County recorders' own free recording alerts: the county emails a person who signs up on its site when a document is
 * recorded on their property. A hand-read table, official pages only, read November 22, 2026. The person signs up with
 * the county themselves; Pantopus sends the county nothing. Add a county only after reading its own page.
 *
 *   office   the office as its page names itself
 *   url      the sign-up page (the county's own page links to it: `from`)
 */

const COUNTIES = {
  // Clark County, WA: linked from https://clark.wa.gov/auditor/recording-overview ("Recording Notification").
  53011: { office: 'Clark County\'s Auditor', url: 'https://e-docs.clark.wa.gov/LandmarkWeb/FraudAlert', from: 'https://clark.wa.gov/auditor/recording-overview' },
  // Pierce County, WA ("Owner Alert"): linked from https://www.piercecountywa.gov/8573/Owner-Alert-Service.
  53053: { office: 'Pierce County\'s Auditor', url: 'https://armsweb.co.pierce.wa.us/RecordsNotificationService/Subscribe', from: 'https://www.piercecountywa.gov/8573/Owner-Alert-Service' },
  // Snohomish County, WA: linked from https://www.snohomishcountywa.gov/6335/Recorded-Document-Notification-System.
  53061: { office: 'Snohomish County\'s Auditor', url: 'https://www.snoco.org/RecordedDocuments/FraudAlert', from: 'https://www.snohomishcountywa.gov/6335/Recorded-Document-Notification-System' },
  // Chelan County, WA: linked from https://co.chelan.wa.us/auditor/pages/recording-notification-service.
  53007: { office: 'Chelan County\'s Auditor', url: 'https://acclaim.co.chelan.wa.us/PublicRecordsNotificationWeb/', from: 'https://co.chelan.wa.us/auditor/pages/recording-notification-service' },
};

/** The county's alert service, by FIPS, or null. */
function forCounty(fips) {
  return COUNTIES[String(fips || '')] || null;
}

/** The owner's `card` block for a county with an alert service, or null. */
function card(fips) {
  const county = forCounty(fips);
  if (!county) return null;
  return {
    kind: 'card',
    id: 'recording_alerts',
    title: 'Recording alerts',
    chip: null,
    lead: `${county.office} emails you when a document is recorded on your property. It is free, and you sign up with the county.`,
    rows: [],
    notes: [],
    source: null,
    action: { label: 'Sign up on the county\'s site', url: county.url },
  };
}

module.exports = { forCounty, card, COUNTIES };
