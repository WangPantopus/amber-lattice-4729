import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “A home is hard to fake.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function Image() {
  return shareImage({ eyebrow: 'Social network', lines: ['A home is', 'hard to fake.'], note: 'A social network of real people at real homes.' });
}
