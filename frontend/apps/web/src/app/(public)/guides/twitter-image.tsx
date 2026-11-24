import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Plain guides to the place you live.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function TwitterImage() {
  return shareImage({ eyebrow: 'Guides', lines: ['Plain guides to', 'the place you live.'], note: 'Home, records, safety and plans, with sources.' });
}
