// FASTVERIFY: a location fast check whose second match didn't come within 14 days stops counting by itself
// (homePermissions.fastCheckStands); this hourly pass tells the person once ("Open Pantopus at home to keep your
// Verified mark"). With home_fast_verify off for the person nobody is told.
const { noticeLapsed } = require('../services/fastCheck/locationCheck');

module.exports = async function fastCheckLocationLapse() {
  return noticeLapsed();
};
