import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Everyone at home sees what’s due.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function Image() {
  return shareImage({ eyebrow: 'Today', lines: ['Everyone at home', 'sees what’s due.'], note: 'Your home’s day in one place.' });
}
