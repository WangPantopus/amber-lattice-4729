// ─────────────────────────────────────────────────────────────────────────────
// /moments: stories on a map, gone in a day. The homepage's Moments section (heading, lines and groups as approved on
// 2026-11-18), with what each line is underneath, read from the code: backend/routes/moments.js and
// backend/services/moments/momentStore.js, momentMedia.js (kinds, lengths, lifetimes, who sees what, the picture check,
// heights), ios/Moments/** (the composer, the map, the viewer, elevation and float, the globe), android moments/**,
// and the web's /app/moments (components/moments/MomentsExperience.tsx, MomentComposer.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import type { PillarContent } from '../_components/PillarPage';

export const MOMENTS: PillarContent = {
  key: 'moments',
  path: '/moments',
  name: 'Moments',
  icon: 'moment',
  title: (
    <>
      See the moments <em>around you.</em>
    </>
  ),
  lede: 'Short posts with a real place attached. Photos, videos and a few words, on the map where they happened, gone in a day or two.',
  more: 'Moments are stories on a map. Open it and you see faces where things are happening right now, near you or anywhere you look, and each one disappears when its hours are up.',
  action: 'app',
  route: 'pillar:moments',
  glance: [
    { value: '1 to 48 hours', label: 'you choose how long a Moment lasts, then it is gone' },
    { value: 'Up to 5 minutes', label: 'of video, posted as up to five Moments in a row' },
    { value: 'Checked first', label: 'every photo and video, before anyone sees it' },
    { value: 'On the map', label: 'where it happened, or the area around it' },
  ],
  clip: { name: 'moments', label: 'The Moments tab: faces on a map, then the map zooms out into a globe', caption: 'Moments · the map becomes a globe' },
  can: {
    title: (
      <>
        How do stories on <em>a map work?</em>
      </>
    ),
    intro: 'Post a Moment where you are, then watch the map fill with the ones around you.',
    groups: [
      {
        title: 'Post it',
        items: [
          { text: 'Photos, videos up to 5 minutes, and text cards', small: 'A photo, a video, or a few words on a colored card. A long video posts as up to five Moments in a row.' },
          { text: 'Pinned where it was taken, or at a place you pick', small: 'The pin goes where the photo was taken, or at a public place you pick nearby.' },
          { text: 'Show the area instead of the spot', small: 'People then see a pin within about half a mile, not the exact spot.' },
          { text: 'Lasts 1, 6, 24 or 48 hours', small: 'You choose how long it stays up. Then it is gone.' },
          { text: 'Share now or share later', small: 'Post at once, or let it go out later: in an hour, in three, or tonight at eight.' },
          { text: 'Every photo and video is checked before it goes live', small: 'A picture check runs on each one first. Moments are for people 18 and older.' },
        ],
      },
      {
        title: 'See it',
        items: [
          { text: 'A map of faces: what is happening, where, right now', small: 'Rings of profile pictures where Moments were posted, bubbles where it is busy, and how many are new near you.' },
          { text: 'The last 30 minutes, the last hour, the last day', small: 'Filter the map by how recent a Moment is.' },
          { text: 'Elevation: how high each moment was, even from a plane', small: 'Each Moment can show its height in feet, with a plane for one posted in flight.' },
          { text: 'By day, moments float over the map and cast real shadows', small: 'Moments with a height float above the map, a little bigger the higher they are, with shadows where the sun is right now.' },
          { text: 'Rings on profile pictures; tap one to play', small: 'A ring on someone’s picture in Pulse, chats and profiles means they have Moments up. Tap it to watch.' },
          { text: 'Zoom out and the map becomes a globe', small: 'Pull far enough out and the map turns into the Earth.' },
        ],
      },
    ],
  },
  how: {
    title: (
      <>
        How do you share <em>a moment?</em>
      </>
    ),
    steps: [
      { title: 'Take it, or pick it', text: 'A photo, a video or a text card. Pick up to ten from your album and each becomes its own Moment.' },
      { title: 'Choose where and who', text: 'Pin it where it was taken or at a place nearby, or show the area. Then everyone nearby, or only your connections.' },
      { title: 'Choose how long', text: 'One hour, six, a day or two days. After that it is gone.' },
      { title: 'Watch the map', text: 'People react with a tap, replies come to your messages, and your own Moment shows who has seen it.' },
    ],
  },
  privacy: {
    title: (
      <>
        Who sees <em>your Moments?</em>
      </>
    ),
    quote: 'Show the area instead of the spot.',
    items: [
      { title: 'You choose who sees it:', text: 'anyone who looks at that spot on the map, or only your connections.' },
      { title: 'Show the area,', text: 'and people see a pin within about half a mile, not where you stood.' },
      { title: 'At home, you’re told first.', text: 'Posting at your home warns you that the pin will sit on it.' },
      { title: 'Post with no place,', text: 'and it goes to your connections only, with no pin at all.' },
      { title: 'Mute or report a person.', text: 'Two reports hold a Moment for review.' },
      { title: 'It disappears', text: 'when the hours you chose are up.' },
    ],
  },
  questions: {
    title: (
      <>
        What people ask about <em>stories on a map</em>
      </>
    ),
    items: [
      {
        q: 'Is there an app that shows stories on a map?',
        a: 'Moments are short posts pinned on a map where they happened: photos, videos and text cards. Open the map to see what is happening around you right now.',
      },
      { q: 'How long do Moments last?', a: 'One, 6, 24 or 48 hours, your choice. Then they are gone.' },
      {
        q: 'Can I share a Moment without showing exactly where I am?',
        a: 'Yes. Show the area instead and people see a pin within about half a mile. Or post with no place, to your connections only.',
      },
      {
        q: 'Who can see my Moments?',
        a: '“Everyone nearby” means anyone who looks at that spot on the map. “My connections” means only them.',
      },
      { q: 'How long can a video be?', a: 'Up to 5 minutes. A video longer than a minute posts as up to five Moments in a row.' },
      {
        q: 'Are Moments checked?',
        a: 'Every photo and video is checked before it goes live, and Moments are for people 18 and older. Two reports hold a Moment for review.',
      },
      {
        q: 'Can I see Moments on the web?',
        a: 'Yes. On the web, Moments has the same map of faces, the time filter and elevation, and you can post a photo, a video or a text card there. It is in the iPhone and Android apps too.',
      },
    ],
  },
  related: ['pulse', 'plans', 'chat'],
  close: {
    title: (
      <>
        Short posts with <em>a real place attached.</em>
      </>
    ),
    text: 'Get the app and see what is happening around you, right now.',
  },
};
