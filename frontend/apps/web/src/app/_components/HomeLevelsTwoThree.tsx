// Level 2, the street (Pulse, Support Train), and Level 3, the town (Plans, Moments). Words as approved in the sample
// (2026-11-18).

import { Chapter, Clip, Level } from './HomeChapter';
import styles from './home.module.css';

const TRAIN_DAYS: Array<[string, boolean]> = [
  ['S', true], ['M', true], ['T', false], ['W', true], ['T', true], ['F', false], ['S', true],
  ['S', true], ['M', false], ['T', true], ['W', true], ['T', false], ['F', true], ['S', false],
];

function TrainCard() {
  return (
    <div className={`${styles.card} ${styles.train}`}>
      <span className={styles.eyebrow}>Support Train</span>
      <h4>Dinners for the Parkers after surgery</h4>
      <p>Organized by Lee · two weeks of dinners · no nuts</p>
      <div className={styles.days}>
        {TRAIN_DAYS.map(([day, on], i) => (
          <i key={i} data-on={on ? '' : undefined}>
            {day}
          </i>
        ))}
      </div>
      <div className={styles.bar}>
        <b />
      </div>
      <div className={styles.mini}>
        <span>9 of 14 dinners covered</span>
        <b>5 days still open</b>
      </div>
    </div>
  );
}

export function LevelTwo() {
  return (
    <>
      <Level
        u="0:1.45,1:2"
        eyebrow="Level 2 · The street"
        title={
          <>
            Now step <em>outside.</em>
          </>
        }
        lede="Every lit window is a real household. Know what is going on around you, from the people who actually live there."
        scale="300 metres"
      />

      <Chapter
        id="pulse"
        u="2"
        icon="pulse"
        eyebrow="Pulse"
        title={
          <>
            Know what’s going on. <em>No crime alerts.</em>
          </>
        }
        lede="Questions, recommendations, events, deals and good news from around you, and updates from the people you know. See it as a list, or on a map that shows where things are happening."
        groups={[
          {
            title: 'What people post',
            items: [
              'Asks and recommendations',
              'Events, with a Going button',
              'Deals and offers nearby',
              'Lost and found',
              'Heads-ups: outages, road hazards, a missing pet',
              'Local updates, wins and a visitor’s guide',
            ],
          },
          {
            title: 'How you see it',
            items: [
              'Nearby, or only your connections',
              'A 3D map where new posts ripple',
              'Your homes, saved places, or where you are now',
              'Repost, or repost with your own words',
              'Choose what you see: deals, alerts, politics',
            ],
          },
          {
            title: 'Why it stays real',
            items: [
              'Only people who live there or are there can post to an area',
              'No crime or suspicious-person posts, by rule',
              'Posts end on their own when they stop being useful',
              'Other people see a post’s area, not your door',
            ],
          },
        ]}
        visual={<Clip name="pulse" label="The Pulse tab: posts appear as pins on a map" caption="Pulse · list or map" />}
      />

      <Chapter
        id="train"
        u="2.2"
        flip
        icon="heart"
        eyebrow="Support Train"
        title={
          <>
            When someone needs help, <em>show up.</em>
          </>
        }
        lede="A new baby, a surgery, a loss. Organize meals, groceries and the things a household needs, one day at a time, so nobody has to ask twice."
        groups={[
          {
            title: 'Organize it',
            items: [
              'Home-cooked meals, takeout and groceries',
              'A calendar of days, one helper each',
              'Allergies, favorites, drop-off window, contactless',
              'Write the page from your story with Pantopus AI',
              'Gift funds for what a meal cannot cover',
            ],
          },
          {
            title: 'Help with it',
            items: [
              'Sign up by email, no account and no app',
              'The address goes only to the people helping',
              'Reminders the evening before and on the day',
              'Updates with photos, and a group chat',
              'Thank-you letters arrive in Mail',
            ],
          },
        ]}
        visual={<TrainCard />}
      />
    </>
  );
}

export function LevelThree() {
  return (
    <>
      <Level
        u="0:2.3,1:3"
        eyebrow="Level 3 · The town"
        title={
          <>
            Then go and do <em>something.</em>
          </>
        }
        lede="Thousands of windows, and behind each one somebody with a free Saturday. Make a plan. See what is happening across town right now."
        scale="5 kilometres"
      />

      <Chapter
        id="plans"
        u="3"
        icon="plans"
        eyebrow="Plans"
        title={
          <>
            Make plans with the people <em>in your life.</em>
          </>
        }
        lede="Friends, family, the team, the people nearby. Pick a kind and a time. The exact spot shows once the host says yes."
        groups={[
          {
            title: 'Any kind of plan',
            items: [
              'Watch parties, game nights and dinners',
              'Pickup games, hikes, runs and rides',
              'Walks and coffee, playdates, study groups',
              'Trips, parties and anything else',
              'Thanksgiving, Friendsgiving, gift exchanges, New Year’s Eve, birthdays',
            ],
          },
          {
            title: 'Everything a host needs',
            items: [
              'Private, repeating and online plans',
              'Find a date, a bring list, chip in',
              'Invite by text, email or link',
              'Guests answer in a browser, without the app',
              'A chat that opens at the first yes',
              'Reminders with buttons on the lock screen',
              'Same people again, and photos afterwards',
            ],
          },
          {
            title: 'With local businesses',
            biz: true,
            items: [
              'Plans hosted by the places you like',
              'Deals and discounts for your group',
              'Paid spots, held for you',
              'Pay the bill together, tip included',
            ],
          },
        ]}
        visual={<Clip name="plans" label="The Plans tab: someone asks to join, the host says yes and the exact spot appears" caption="Plans · the spot shows after the yes" />}
      />

      <Chapter
        id="moments"
        u="3.1"
        flip
        icon="moment"
        eyebrow="Moments"
        title={
          <>
            See the moments <em>around you.</em>
          </>
        }
        lede="Short posts with a real place attached. Photos, videos and a few words, on the map where they happened, gone in a day or two."
        groups={[
          {
            title: 'Post it',
            items: [
              'Photos, videos up to 5 minutes, and text cards',
              'Pinned where it was taken, or at a place you pick',
              'Show the area instead of the spot',
              'Lasts 1, 6, 24 or 48 hours',
              'Share now or share later',
              'Every photo and video is checked before it goes live',
            ],
          },
          {
            title: 'See it',
            items: [
              'A map of faces: what is happening, where, right now',
              'The last 30 minutes, the last hour, the last day',
              'Elevation: how high each moment was, even from a plane',
              'By day, moments float over the map and cast real shadows',
              'Rings on profile pictures; tap one to play',
              'Zoom out and the map becomes a globe',
            ],
          },
        ]}
        visual={<Clip name="moments" label="The Moments tab: faces on a map, then the map zooms out into a globe" caption="Moments · the map becomes a globe" />}
      />
    </>
  );
}
