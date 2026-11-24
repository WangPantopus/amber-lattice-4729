import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Run your home together.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function Image() {
  return shareImage({ eyebrow: 'Home management', lines: ['Run your home', 'together.'], note: 'Shared tasks, reminders and mail for your home.' });
}
