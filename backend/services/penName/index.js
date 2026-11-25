// Made-up names ("pen names" in code): one name a person may choose for a post or a reply, so the people around them
// can't see who wrote it. The founder approved the design on 2026-11-25 (the Claude Doc "Made-up names: posting
// without your name"); the build contract is docs/product/made-up-names/README.md.
//
//   owner.js    who wrote what: the only way to the private "PenNameOwner" table
//   names.js    the names: typed and checked, or given by Pantopus; the drawn picture
//   gate.js     who may use one, where, how often, and the automatic check of the words
//   present.js  what a reader gets, the writer's own view, and what a person muted or blocked
//   write.js    saving a post or a reply under the system account, with its owner recorded first
//   notices.js  who really gets a notice addressed to the system account
//   standing.js holds after reports, strikes after a removal, and the logged staff look
//
// Routes: backend/routes/penNames.js, and the `penName` lines in backend/routes/posts.js.

const owner = require('./owner');
const names = require('./names');
const gate = require('./gate');
const present = require('./present');
const write = require('./write');
const notices = require('./notices');
const standing = require('./standing');

module.exports = {
  SYSTEM_ACCOUNT_ID: owner.SYSTEM_ACCOUNT_ID,
  KIND: owner.KIND,
  isPenNameRow: owner.isPenNameRow,
  owner,
  names,
  gate,
  present,
  write,
  notices,
  standing,
};
