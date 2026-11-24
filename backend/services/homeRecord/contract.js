'use strict';

/**
 * The contract's last look before an answer leaves (~/pantopus-home-record/SPEC.md section 3, v1 frozen): every block
 * has a kind the contract names and an id, tones, levels, icons and links are the contract's, and a block that isn't
 * is left out with a log line rather than sent to apps that would draw it wrong.
 */

const logger = require('../../utils/logger');

const KINDS = new Set(['picture', 'facts', 'meters', 'intro', 'closed_group', 'promise', 'note', 'section_label', 'value',
  'photo_years', 'timeline', 'notice', 'rows', 'tiles', 'bars', 'card']);
const ICONS = new Set(['history', 'trend', 'tag', 'bank', 'bars', 'shield', 'image', 'wrench', 'bell', 'layers', 'home', 'alert',
  'file', 'mail', 'percent', 'eye_off']);
const CHIP_TONES = new Set(['success', 'warning', 'neutral']);
const METER_TONES = new Set(['low', 'mid', 'high']);

const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isLink = (link) => link == null || (isText(link.label) && isText(link.url) && /^(\/|https:\/\/)/.test(link.url));
const isChip = (chip) => chip == null || (CHIP_TONES.has(chip.tone) && isText(chip.text));
const isFraction = (n) => typeof n === 'number' && n >= 0 && n <= 1;

function problem(block) {
  if (!block || !KINDS.has(block.kind) || !isText(block.id)) return 'kind or id';
  switch (block.kind) {
    case 'picture':
      return (!block.above || ((isText(block.above.image_url) && /^(\/|https:\/\/)/.test(block.above.image_url))
        && (block.above.chips || []).every((chip) => ['bl', 'br'].includes(chip.at) && isText(chip.text))))
        && (block.above || block.street) ? null : 'picture';
    case 'facts':
      return Array.isArray(block.tiles) && block.tiles.length <= 3 && block.tiles.every((tile) => isText(tile.label) && isText(tile.value)) ? null : 'tiles';
    case 'meters':
      return Array.isArray(block.groups) && block.groups.length && block.groups.every((group) => isText(group.title) && group.rows.length
        && group.rows.every((row) => isText(row.label) && Number.isInteger(row.level) && row.level >= 1 && row.level <= 5 && METER_TONES.has(row.tone) && isText(row.word)))
        ? null : 'meter rows';
    case 'closed_group':
      return isText(block.title) && block.items.length && block.items.every((item) => ICONS.has(item.icon) && isText(item.title) && isText(item.line)) ? null : 'items';
    case 'promise':
      return isLink(block.button) && block.button && isLink(block.alt) ? null : 'links';
    case 'note':
      return ICONS.has(block.icon) && isText(block.text) ? null : 'note';
    case 'value':
      return isText(block.value) && isChip(block.chip) && (!block.estimate || [block.estimate.low, block.estimate.high, block.estimate.mark].every(isFraction)) ? null : 'value';
    case 'rows':
      return block.rows.length && block.rows.every((row) => isText(row.label) && isChip(row.chip)) && isLink(block.action) ? null : 'rows';
    case 'bars':
      return block.items.length && block.items.every((item) => isText(item.title) && METER_TONES.has(item.tone) && isFraction(item.fill)) ? null : 'bars';
    case 'timeline':
      return block.items.length && block.items.every((item) => isText(item.title)) ? null : 'timeline';
    case 'card':
      return isText(block.title) && isChip(block.chip) && isLink(block.action) && Array.isArray(block.rows) && Array.isArray(block.notes) ? null : 'card';
    default:
      return null;
  }
}

/** The answer with only blocks that keep the contract. */
function check(answer) {
  const blocks = answer.blocks.filter((block) => {
    const why = problem(block);
    if (why) logger.warn('homeRecord.block_left_out', { kind: block?.kind || null, id: block?.id || null, why });
    return !why;
  });
  // The buyer's row of actions (SPEC section 8): save, share, claim; a client skips an id it doesn't know.
  const actions = Array.isArray(answer.actions)
    ? answer.actions.filter((action) => ['save', 'share', 'claim'].includes(action?.id) && isLink(action))
    : undefined;
  return { ...answer, header: { ...answer.header, chip: isChip(answer.header.chip) ? answer.header.chip : null }, ...(actions ? { actions } : {}), blocks };
}

module.exports = { check, KINDS };
