import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Help with Pantopus.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function Image() {
  return shareImage({ eyebrow: 'Help', lines: ['Help with', 'Pantopus.'], note: 'Your account, your home and each part of the app.' });
}
