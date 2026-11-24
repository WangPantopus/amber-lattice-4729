// The dive from the whole Earth to one lit window, then Level 1, one home: Verified, Place, Today and Mail, with the
// Christmas band. Words as approved in the sample (2026-11-18).

import Link from 'next/link';
import { PantopusMark } from '@/components/brand/PantopusMark';
import { Chapter, Clip, Level } from './HomeChapter';
import { MEDIA } from './stage/media';
import styles from './home.module.css';

/** "/#how-it-works" (the other pages' footers) lands on the dive. */
export function Dive() {
  return (
    <section className={styles.dive} id="how-it-works" data-dive="" data-u="0:5,.26:4,.46:3,.66:2,.84:1,1:0" data-scrim=".3">
      <div className={styles.stick}>
        <div className={styles.wrap}>
          <ul className={styles.ladder} data-ladder="">
            <li data-on="">One planet.</li>
            <li>Billions of homes.</li>
            <li>
              One of them is <em>yours.</em>
            </li>
          </ul>
          <p className={styles.ladderNote} data-ladder-note="">
            Pantopus starts there, at your real address, and connects it to everything around it.
          </p>
        </div>
      </div>
    </section>
  );
}

const CELLS = ['', 'a', 'a', '', 'a', '', 'a', 'b', 'c', 'b', 'a', '', '', 'a', 'b', 'a', '', 'a'];

function VerifiedCard() {
  return (
    <div className={styles.card}>
      <div className={styles.postcard}>
        <div className={styles.postcardTo}>
          To the household at
          <br />
          <b>1 Example Way</b>
        </div>
        <div className={styles.stamp}>
          <PantopusMark size={30} />
        </div>
        <div className={styles.code}>
          Your code <b>482</b>
          <b>915</b>
        </div>
      </div>
      <div className={styles.verified}>
        <span className={styles.tick}>
          <svg className={styles.ic} style={{ strokeWidth: 2.6 }} viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        <div>
          <b>Maya · Verified resident</b>
          <span>Shown as “Maya, Maple St”</span>
        </div>
      </div>
      <div className={styles.cells} role="img" aria-label="Verified homes nearby, by cell">
        {CELLS.map((c, i) => (
          <i key={i} data-c={c || undefined} data-you={i === 8 ? '' : undefined} />
        ))}
      </div>
      <div className={styles.mini}>
        <span>Verified homes nearby</span>
        <b>10 to 24 in your cell</b>
      </div>
    </div>
  );
}

export default function LevelOne() {
  return (
    <>
      <Level
        u="0:0,1:1"
        eyebrow="Level 1 · One home"
        title={
          <>
            A home is hard <em>to fake.</em>
          </>
        }
        lede="Anyone can make an account. A bot can write a post. Nobody can make up the address they live at. Pantopus ties each person to a real home, so there is a real person behind every post, plan and letter."
        scale="15 metres"
      />

      <Chapter
        id="real"
        u="1"
        icon="shield"
        eyebrow="Verified"
        title={
          <>
            Proven by where you <em>actually live.</em>
          </>
        }
        lede="Verify once and the people around you know you are real. You stay private: a first name and a street, at most."
        groups={[
          {
            title: 'Four ways to prove it',
            items: [
              'A code on a postcard, mailed to your door',
              'A bill or your lease',
              'Your landlord says yes',
              { text: 'A fast check', small: 'Your phone number, being at home right now, or a bill read on the spot' },
            ],
          },
          {
            title: 'What it opens',
            items: [
              'The Verified mark on your name',
              'Message the homes on your block',
              'Real rent, from verified renters near you',
              'Residency letters and a pass that proves one fact',
              'Mail for your home',
              'Ownership, confirmed separately',
            ],
          },
          {
            title: 'What stays yours',
            items: [
              'Your address is never sold and never used for ads',
              'Nobody sees your house number or unit',
              'Verified homes are counted in ranges, never shown as dots',
              'See your home the way an outsider sees it',
              'Take your address off data-broker sites',
            ],
          },
        ]}
        visual={<VerifiedCard />}
      />

      <Chapter
        id="place"
        u="1"
        flip
        icon="home"
        eyebrow="Place"
        title={
          <>
            See what’s true about <em>your address.</em>
          </>
        }
        lede="Type an address and get its public record in plain words. Every fact names its source, and says when it is county-wide and when it is about this exact home."
        groups={[
          {
            title: 'Risk and health',
            items: [
              'Your flood zone, and what flood insurance really costs nearby',
              'Wildfire, earthquake, heat and cold',
              'Radon, lead paint and your drinking water',
              'Registered pollution sites near you',
              'An emergency checklist and a fridge card for 911',
            ],
          },
          {
            title: 'Money',
            items: [
              'Value, last sale and the area’s trend',
              'A property-tax exemption check in all 50 states',
              'Rent range, and real rent on your block',
              'How your bills compare',
              'A mortgage-rate watch',
              'Home Money Check, with a ready tax-appeal packet',
            ],
          },
          {
            title: 'Civic',
            items: [
              'Your districts and who represents you',
              'Every government you live inside',
              'A ballot guide, with live official counts',
              'Council meetings and tax dates on your calendar',
            ],
          },
          {
            title: 'The home and the household',
            items: [
              'Up to 86 facts from the county record',
              'Roof, heating, water heater and panel, by age',
              'Members with roles, and people you invite',
              'Shared tasks with an owner and a due date',
              'Documents where the right people find them',
              'Guest passes, access codes and a maintenance log',
              'Bills, packages, pets, polls and the family calendar',
            ],
          },
        ]}
        visual={<Clip name="place" label="The Place tab: an address is typed and sourced facts appear" caption="Place · every fact names its source" />}
      />

      <Chapter
        id="today"
        u="1.2"
        icon="sun"
        eyebrow="Today"
        title={
          <>
            Everyone at home sees <em>what’s due.</em>
          </>
        }
        lede="The sky over your own house, and the day under it. Weather outside, what is due inside, and what is happening around you."
        groups={[
          {
            title: 'At home',
            items: [
              'A living sky over your house, drawn from the county record',
              'Hour by hour, with the sun’s arc and tonight’s moon',
              'Weather alerts in the official words',
              'Air quality from the nearest monitor',
              '“Good day for” a run, open windows, the lawn, the grill',
              'Coming up at home: pickups, tasks, plans, tax dates',
              'Bin-night reminders, set from a photo of the flyer',
              'A radon test, turned into a task',
              'Needs you: requests, invitations and overdue tasks',
            ],
          },
          {
            title: 'Around you',
            items: [
              'Local headlines from local outlets, each one linked',
              'Events, the season, and on this day',
              'React, reply and repost',
              'No crime feed, no obituaries, no party politics',
            ],
          },
          {
            title: 'Wherever you look',
            items: [
              'Morning and evening briefings, only when there is something useful',
              'On your lock screen and home screen',
              'Share today’s sky as a picture or a short video',
              'Works from a city before you add an address',
            ],
          },
        ]}
        visual={<Clip name="today" label="The Today tab: a task is ticked off and the household sees it" caption="Today · one home, one list" />}
      />

      <Chapter
        id="mail"
        u="1.4"
        flip
        icon="mail"
        eyebrow="Mail"
        title={
          <>
            Letters and cards, delivered <em>at 7 a.m.</em>
          </>
        }
        lede="A mailbox for your home, on your phone. Mail comes once each morning, stamped and sealed. No paper, no truck, no pile on the counter, and nothing lost in a feed."
        groups={[
          {
            title: 'Your mailbox',
            items: [
              'Delivered at 7:00 in your own time zone, urgent pieces at once',
              'Drawers for you, your home and your business',
              'Incoming, a Counter for what needs an answer, and a Vault',
              'Pantopus reads each letter for you: a summary and the key facts',
              'Bills with a Pay button',
              'Hold my mail while you are away',
              'Packages tracked to the door',
              'Search everything, translate anything',
            ],
          },
          {
            title: 'Write back',
            items: [
              'Stationery, ink, a wax seal and your own voice',
              'To your household, your connections and the homes around you',
              'Certified mail and signing',
              'Take it back until the morning pickup',
            ],
          },
          {
            title: 'For businesses and campaigns',
            biz: true,
            items: [
              'Send as your business: a bill, a notice, an offer',
              'Reach real homes by city, ZIP or distance',
              'See where your mail went and what it led to',
              'Earn: people are paid to read the offers they choose',
            ],
          },
        ]}
        visual={<Clip name="mail" label="The Mail tab: a Christmas card is written and sealed, then the morning mail arrives" caption="Mail · stamped, sealed, on time" />}
        after={
          <div className={styles.xmas} data-rv="">
            <video
              muted
              loop
              playsInline
              preload="none"
              data-poster={`${MEDIA}/cards-poster.jpg`}
              data-src={`${MEDIA}/cards.mp4`}
              aria-label="A red envelope with a gold wax seal is opened by hand on a table"
            />
            <div className={styles.say}>
              <span className={styles.eyebrow} style={{ color: '#ff8a80' }}>
                This Christmas
              </span>
              <h3>
                A Christmas card they open <em>by hand.</em>
              </h3>
              <p>
                Pick from 67 cards. Write a few words, sign it yourself, seal it by hand. It stays sealed until 7:00 a.m. on
                Christmas morning, wherever they live.
              </p>
              <ul className={styles.tags}>
                <li>Add a photo and your voice</li>
                <li>One card to 20 people</li>
                <li>By email or link to anyone</li>
                <li>Help me write it</li>
                <li>Share as a picture or a video</li>
                <li>They can write back</li>
              </ul>
              <div>
                <Link className={styles.btnLight} href="/cards">
                  Send a card · your first 7 are free
                </Link>
              </div>
            </div>
          </div>
        }
      />
    </>
  );
}
