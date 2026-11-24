import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Letters and cards, delivered at 7 a.m.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function TwitterImage() {
  return shareImage({ eyebrow: 'Mail', lines: ['Letters and cards,', 'delivered at 7 a.m.'], note: 'A mailbox for your home, on your phone.' });
}
