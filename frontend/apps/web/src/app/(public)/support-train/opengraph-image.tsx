import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “When someone needs help, show up.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function Image() {
  return shareImage({ eyebrow: 'Support Train', lines: ['When someone needs', 'help, show up.'], note: 'Organize meals for someone, one day at a time.' });
}
