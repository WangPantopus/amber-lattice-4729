import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Know what’s going on. No crime alerts.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function Image() {
  return shareImage({ eyebrow: 'Pulse', lines: ['Know what’s going on.', 'No crime alerts.'], note: 'A local social network of real people.' });
}
