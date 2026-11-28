import type { homes } from '@pantopus/api';

/**
 * What a person who can't open a Home yet is told, and what they can do next, from the server's own answer
 * (GET /api/homes/:id/my-residency). One table for the Residency status page and the Home dashboard's verification
 * panel, so the two can't say different things about the same Home.
 */
const guidance = {
  home: { title: 'You’re part of this household', body: 'Open the Home to see your household. What you can see and change depends on your role.' },
  household_review: { title: 'Waiting for household review', body: 'Someone in the household will review your request. You don’t need to upload any documents. Check back here for their answer.' },
  address_verification: { title: 'Your address isn’t verified yet', body: 'Your request is saved. To finish, verify your address by mail: request a postcard, then enter the code printed on it.' },
  resubmit: { title: 'Send your request again', body: 'Check the street, apartment and how you live here, then send your request again.' },
  access_review: { title: 'You don’t have household access', body: 'To come back, add this Home again or ask someone in the household to invite you.' },
  ownership_verification: { title: 'Continue ownership verification', body: 'Ownership has its own review. Meanwhile, you can verify your address by mail to use this Home. That doesn’t make you an owner.' },
  unavailable: { title: 'This Home can’t be verified right now', body: 'This Home isn’t accepting changes right now. Your request is still saved.' },
};
// Probation (a request nobody answered in 7 days) has its own guidance; next_step stays what older apps know.
const probationGuidance = {
  active: { title: 'You’re on probation', body: 'Nobody in the household answered your request in 7 days, so you’re on probation. Household records stay private until someone there says yes or you verify your address by mail.' },
  ended: { title: 'The household said no', body: 'Someone in the household said you don’t live here, so your probation ended. If you do live here, verify your address by mail. Pantopus will review your proof, and your access stays off until then.' },
  review: { title: 'Pantopus is reviewing your proof', body: 'You verified this address by mail after the household said no. Pantopus is reviewing it, and your access stays off until then.' },
  declined: { title: 'Pantopus kept the household’s answer', body: 'Pantopus reviewed your proof of this address and kept the household’s no. If you have new proof, you can verify by mail again and Pantopus will take another look.' },
};

export interface ResidencyAction { label: string; href: string; primary: boolean }

/** The headline, the explanation and the links for this person's next step at this Home, in the order shown. */
export function residencyNextStep(progress: homes.PersonalResidencyProgress, homeId: string): { title: string; body: string; actions: ResidencyAction[] } {
  const needsRequest = progress.next_step === 'address_verification' && progress.request === null;
  const mailAvailable = progress.mail_available === true;
  const next = progress.probation ? probationGuidance[progress.probation] : needsRequest ? {
    title: 'Confirm your address',
    body: 'Check this Home’s address, apartment and how you live here, then send your request. We don’t mail anything until you ask for a postcard.',
  } : guidance[progress.next_step];
  const mailBack = progress.probation === 'active' || progress.probation === 'ended' || progress.probation === 'declined';
  let body = next.body;
  if (!mailAvailable) {
    if (mailBack) body = 'Household access is limited. Mail verification is currently unavailable. Contact support if you need help.';
    else if (progress.next_step === 'address_verification' && !needsRequest) body = 'Your request is saved. Mail verification is currently unavailable.';
    else if (progress.next_step === 'ownership_verification') body = 'Continue your ownership claim to see which steps are left.';
  }
  const actions: ResidencyAction[] = [];
  if (progress.next_step === 'home') actions.push({ label: 'Open Home', href: `/app/homes/${homeId}/dashboard`, primary: true });
  if (progress.next_step === 'resubmit') actions.push({ label: 'Check address and send again', href: `/app/homes/new?joinHome=${homeId}`, primary: true });
  if (needsRequest) actions.push({ label: 'Check address', href: `/app/homes/new?joinHome=${homeId}`, primary: true });
  if (mailAvailable && ((progress.next_step === 'address_verification' && !needsRequest) || mailBack)) {
    actions.push({ label: 'Verify by mail', href: `/app/homes/${homeId}/verify-postcard`, primary: true });
  }
  if (progress.next_step === 'ownership_verification') {
    actions.push({ label: 'Continue ownership verification', href: `/app/homes/${homeId}/claim-owner/evidence`, primary: true });
    // While ownership waits, a pending owner can still prove the address by mail (founder decision, 2026-10-06).
    if (mailAvailable) actions.push({ label: 'Verify by mail', href: `/app/homes/${homeId}/verify-postcard`, primary: false });
  }
  return { title: next.title, body, actions };
}
