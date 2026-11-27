import FieldGuide from '@/components/reinvented/guide/FieldGuide';

// Pulse, reinvented: the reader's own field guide (collected field cards, saved steps). Private; never indexed.
export const metadata = { title: 'Your field guide', robots: { index: false, follow: false } };

export default function FieldGuidePage() {
  return <FieldGuide />;
}
