import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Check a home before you buy it.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function TwitterImage() {
  return shareImage({ eyebrow: 'Buying a home', lines: ['Check a home', 'before you buy it.'], note: 'Its public record, free, with sources.' });
}
