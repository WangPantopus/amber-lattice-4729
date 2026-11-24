import { SHARE_SIZE, SHARE_TYPE, shareImage } from '../_lib/shareImage';

export const alt = 'The Earth at night, under the words “Make plans with the people in your life.”';
export const size = SHARE_SIZE;
export const contentType = SHARE_TYPE;

export default function TwitterImage() {
  return shareImage({ eyebrow: 'Plans', lines: ['Make plans with the', 'people in your life.'], note: 'Find a date, invite anyone, meet up.' });
}
