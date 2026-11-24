import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Message real people, home to home.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function TwitterImage() {
  return shareImage({ eyebrow: 'Chat', lines: ['Message real people,', 'home to home.'], note: 'Your household, your plans, your block.' });
}
