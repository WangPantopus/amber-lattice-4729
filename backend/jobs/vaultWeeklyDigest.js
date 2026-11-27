// ============================================================
// VAULT WEEKLY DIGEST JOB
// Sends a weekly summary of Vault activity:
// - Items auto-filed this week
// - Unfiled items needing attention
// - Vault storage stats per drawer
// Runs every Monday at 9:00 AM UTC.
// ============================================================

const supabaseAdmin = require('../config/supabaseAdmin');
const logger = require('../utils/logger');
const { skipForLaunchCut } = require('../utils/featureFlags');

async function vaultWeeklyDigest() {
  // Launch cut #10 (Mailbox): mailbox jobs don't run while the mailbox is off.
  if (skipForLaunchCut('mailbox', 'vaultWeeklyDigest')) return;
  logger.info('[VaultDigest] Starting weekly vault digest job');

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Get all users who have vault folders (paginated past PostgREST's 1,000-row cap)
  const PAGE_SIZE = 1000;
  const userIdSet = new Set();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: vaultUsers, error: vaultError } = await supabaseAdmin
      .from('VaultFolder')
      .select('user_id')
      .not('user_id', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (vaultError) {
      logger.error('[VaultDigest] Failed to query vault users', { error: vaultError.message });
      return;
    }
    for (const v of vaultUsers || []) userIdSet.add(v.user_id);
    if (!vaultUsers || vaultUsers.length < PAGE_SIZE) break;
  }

  const userIds = [...userIdSet];
  logger.info(`[VaultDigest] Found ${userIds.length} vault users`);

  let digested = 0;

  for (const userId of userIds) {
    try {
      const [
        { count: autoFiledCount },
        { count: unfiledCount },
        { count: totalItems },
        { count: folderCount },
      ] = await Promise.all([
        // Count auto-filed items this week via head:true (no row payload or 1,000-row cap)
        supabaseAdmin
          .from('MailEvent')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('event_type', 'auto_filed')
          .gte('created_at', oneWeekAgo),
        // Count unfiled items in vault tab
        supabaseAdmin
          .from('Mail')
          .select('*', { count: 'exact', head: true })
          .eq('recipient_user_id', userId)
          .is('vault_folder_id', null)
          .eq('archived', true)  // archived but not in a folder
          .in('lifecycle', ['delivered', 'opened', 'expired'])
          .is('deleted_at', null),
        // Count total vault items
        supabaseAdmin
          .from('Mail')
          .select('*', { count: 'exact', head: true })
          .eq('recipient_user_id', userId)
          .not('vault_folder_id', 'is', null)
          .is('deleted_at', null),
        // Count folders
        supabaseAdmin
          .from('VaultFolder')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);

      // Skip if nothing interesting happened
      if ((autoFiledCount || 0) === 0 && (unfiledCount || 0) === 0) {
        continue;
      }

      // Log digest event
      await supabaseAdmin
        .from('MailEvent')
        .insert({
          event_type: 'vault_weekly_digest',
          user_id: userId,
          metadata: {
            auto_filed_this_week: autoFiledCount || 0,
            unfiled_items: unfiledCount || 0,
            total_vault_items: totalItems || 0,
            folder_count: folderCount || 0,
            period_start: oneWeekAgo,
            period_end: new Date().toISOString(),
          },
        });

      digested++;
    } catch (err) {
      logger.error('[VaultDigest] Error processing user', {
        userId,
        error: err.message,
      });
    }
  }

  logger.info(`[VaultDigest] Complete: ${digested} digests generated`);
}

module.exports = vaultWeeklyDigest;
