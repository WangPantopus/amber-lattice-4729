import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “How safe is your address?”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function TwitterImage() {
  return shareImage({ eyebrow: 'Home safety', lines: ['How safe is', 'your address?'], note: 'Flood, fire, earthquake, radon and water, free.' });
}
