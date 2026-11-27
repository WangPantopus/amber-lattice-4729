'use strict';

// Pulse, reinvented, phase 1, server step 6: "Want to come?" (coord CONTRACT 6g). The author starts a plan in Plans
// from their own Moment, through Plans' own createPlan (the same checks, limits, switches and answers), never as a
// business. The Moment keeps only the plan's id in its own row; who may see the plan is Plans' own decision
// (getForViewer), read when a Moment answer is built for a reader whose switch is on.

const store = require('../moments/momentStore');
const penName = require('../penName');
const { isFeatureEnabled } = require('../featureFlagService');
const planActions = require('../plans/planActions');
const planService = require('../plans/planService');
const { loadViewer } = require('../plans/planViewer');
const logger = require('../../utils/logger');

const PEN_NAME_PLAN = "A plan shows who hosts it, so it can't start from a Moment under a made-up name.";

/** The plan id a Moment started, or null. */
function planIdOf(row) {
  const id = store.meta(row).plan_id;
  return typeof id === 'string' && id ? id : null;
}

/** What a Moment answer says about its plan, from the plan as Plans shows it to this reader. */
function summaryOf(detail) {
  return {
    id: detail.id,
    kind: detail.kind,
    title: detail.title,
    starts_at: detail.starts_at,
    ends_at: detail.ends_at,
    state: detail.state,
    going_count: detail.going_count,
    area_label: detail.area?.label ?? null,
    viewer_role: detail.viewer?.role ?? 'none',
  };
}

/**
 * POST /api/reinvented/moments/:id/plan for `user` (req.user, with the Plans markers the route set). Throws a
 * momentStore error (404, 410, 409, 400) or Plans' own PlanError, which the route answers as Plans does.
 */
async function startPlan(user, momentId, input) {
  const row = await store.ownMoment(momentId, user.id);
  if (!row) throw store.fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  if (store.momentState(row) === 'ended') throw store.fail(410, 'MOMENT_ENDED', 'This Moment has ended.');
  if (penName.isPenNameRow(row)) throw store.fail(400, 'PEN_NAME_PLAN', PEN_NAME_PLAN);
  const already = planIdOf(row);
  if (already) {
    const error = store.fail(409, 'MOMENT_HAS_PLAN', 'This Moment already started a plan.');
    error.extra = { plan_id: already };
    throw error;
  }
  // A plan from a Moment is the person's own, never a business's.
  const { host_as: _business, business_location_id: _location, ...plan } = input || {};
  const detail = await planActions.createPlan({ ...user, plansBiz: false }, plan);
  const updated = await store.updateMoment(row, { moment: { plan_id: detail.id } });
  if (!updated) throw store.fail(404, 'MOMENT_NOT_FOUND', 'This Moment could not be found.');
  const [moment] = await store.serializeMoments([updated], user.id);
  return { plan: detail, moment };
}

/** Whether any of these Moments started a plan. */
function anyStarted(rows) {
  return rows.some((row) => planIdOf(row));
}

/**
 * The plans these Moments started, as `viewerId` may see them in Plans: Moment id → summary, or nothing when the
 * reader can't see the plan (Plans off for them, a private plan they aren't part of, a block, a mute). Plans' own
 * reads decide it (loadViewer, isInvolved, isVisibleTo, buildCard), batched for every plan at once. A failed read
 * leaves `plan` null.
 */
async function plansFor(rows, viewerId) {
  const started = rows.map((row) => [row.id, planIdOf(row)]).filter(([, planId]) => planId);
  const found = new Map();
  if (started.length === 0) return found;
  try {
    const id = String(viewerId);
    const [on, viewer, plans] = await Promise.all([
      isFeatureEnabled('plans', id),
      loadViewer({ id, plansMore: true }),
      planService.loadPlanRows(started.map(([, planId]) => planId)),
    ]);
    if (!on || plans.length === 0) return found;
    const involved = await Promise.all(plans.map((plan) => planService.isInvolved(plan, viewer)));
    const visible = plans.filter((plan, index) => planService.isVisibleTo(plan, viewer, { involved: involved[index] }));
    if (visible.length === 0) return found;
    const ctx = await planService.loadCardContext(visible, viewer);
    const cards = new Map(visible.map((plan) => [plan.post_id, summaryOf(planService.buildCard(plan, viewer, ctx))]));
    for (const [momentId, planId] of started) {
      if (cards.has(planId)) found.set(momentId, cards.get(planId));
    }
  } catch (error) {
    logger.warn('reinvented.moment_plans_failed', { error: error.message });
  }
  return found;
}

module.exports = { startPlan, plansFor, anyStarted, PEN_NAME_PLAN };
