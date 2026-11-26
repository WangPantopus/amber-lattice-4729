import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Get the Pantopus app.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function Image() {
  return shareImage({ eyebrow: 'Get the app', lines: ['Get the', 'Pantopus app.'], note: 'Free on iPhone and Android.' });
}
