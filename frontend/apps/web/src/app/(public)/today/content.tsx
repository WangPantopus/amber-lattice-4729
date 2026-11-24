// ─────────────────────────────────────────────────────────────────────────────
// /today: a home management app, your home's day in one place. The homepage's Today section (heading, lines and
// groups as approved on 2026-11-18), with what each line is underneath, read from the code: the Today screens
// (ios/Place/Detail/Today*.swift, web components/place/detail/TodayDetail.tsx), backend/services/goodDayEngine.js
// (the five verdicts), backend/services/addressCalendarService.js (coming up at home), backend/services/ai/needsYou.js,
// backend/services/aroundYouService.js (local headlines and what is filtered out), backend/routes/hub.js (the
// morning and evening briefings), the widgets (ios/PantopusWidgets/TodayWidget.swift, android widget/).
// ─────────────────────────────────────────────────────────────────────────────

import type { PillarContent } from '../_components/PillarPage';

export const TODAY: PillarContent = {
  key: 'today',
  path: '/today',
  name: 'Today',
  icon: 'sun',
  title: (
    <>
      Everyone at home sees <em>what’s due.</em>
    </>
  ),
  lede: 'The sky over your own house, and the day under it. Weather outside, what is due inside, and what is happening around you.',
  more: 'Today is where a household runs the day: the tasks everyone shares, the trash pickups, the tax dates and the plans, beside the weather, the air and the local news. It opens first in the app once you add your home.',
  action: 'lookup',
  route: 'pillar:today',
  glance: [
    { value: 'One list', label: 'the whole household sees: tasks, pickups and dates' },
    { value: '7 days ahead', label: 'of what is coming up at your address' },
    { value: 'Five verdicts', label: 'a good day for open windows, a run, the car, the lawn, the grill' },
    { value: 'No crime feed', label: 'local headlines without crime, obituaries or party politics' },
  ],
  clip: { name: 'today', label: 'The Today tab: a task is ticked off and the household sees it', caption: 'Today · one home, one list' },
  can: {
    title: (
      <>
        What does Today keep track of <em>for your home?</em>
      </>
    ),
    intro: 'Three parts: your home and the people in it, the area around it, and the places you look at your phone most.',
    groups: [
      {
        title: 'At home',
        items: [
          {
            text: 'A living sky over your house, drawn from the county record',
            small: 'Your own house under the real sky: the moon’s phase, rain, snow, fog and smoke, and street lights that brighten as more homes on the street verify. Drag it to see the next 24 hours.',
          },
          {
            text: 'Hour by hour, with the sun’s arc and tonight’s moon',
            small: 'An hourly strip, the sun’s path with a countdown to sunset, and the days ahead.',
          },
          {
            text: 'Weather alerts in the official words',
            small: 'A warning for your address comes first on the page, in the text the weather service issued.',
          },
          {
            text: 'Air quality from the nearest monitor',
            small: 'The reading from the nearest AirNow monitor, named, or a plain note when the number is an estimate.',
          },
          {
            text: '“Good day for” a run, open windows, the lawn, the grill',
            small: 'Five answers for today, each showing the numbers behind it. A verdict whose numbers are missing is left out, never guessed.',
          },
          {
            text: 'Coming up at home: pickups, tasks, plans, tax dates',
            small: 'The next seven days at your address: trash and recycling pickups, property-tax dates, council meetings, ballot dates, the household’s tasks and the plans you host or join.',
          },
          {
            text: 'Bin-night reminders, set from a photo of the flyer',
            small: 'Photograph the hauler’s flyer and your pickup days fill in. The reminder comes in the evening, the night before.',
          },
          {
            text: 'A radon test, turned into a task',
            small: 'Add a test report from a photo, or keep the test on the home’s list until it is done.',
          },
          {
            text: 'Needs you: requests, invitations and overdue tasks',
            small: 'Requests to join your plans, tasks assigned to you or past due, home invitations and connection requests, together.',
          },
        ],
      },
      {
        title: 'Around you',
        items: [
          {
            text: 'Local headlines from local outlets, each one linked',
            small: 'Stories from outlets that cover your area. Each one opens at the outlet that published it.',
          },
          {
            text: 'Events, the season, and on this day',
            small: 'What is on nearby, what the season brings, and what happened here on this date.',
          },
          {
            text: 'React, reply and repost',
            small: 'Each headline takes reactions and replies, and a repost can show it to your connections in Pulse.',
          },
          {
            text: 'No crime feed, no obituaries, no party politics',
            small: 'Those stories are filtered out before anything reaches Today.',
          },
        ],
      },
      {
        title: 'Wherever you look',
        items: [
          {
            text: 'Morning and evening briefings, only when there is something useful',
            small: 'One short notice in the morning and one in the evening at most. A quiet day sends nothing.',
          },
          {
            text: 'On your lock screen and home screen',
            small: 'Widgets on iPhone and Android show today at your address without opening the app.',
          },
          {
            text: 'Share today’s sky as a picture or a short video',
            small: 'The sky over your city, never your street: a picture, or a few seconds of video when it rains or snows.',
          },
          {
            text: 'Works from a city before you add an address',
            small: 'Use your location, rounded to about a kilometer and kept on your phone, and Today shows that city.',
          },
        ],
      },
    ],
  },
  how: {
    title: (
      <>
        How does a household <em>share the day?</em>
      </>
    ),
    steps: [
      { title: 'Open Today', text: 'From your city, or from your home once you add it. The weather, the air and the alerts are there at once.' },
      { title: 'Bring the household', text: 'Invite the people you live with. Each task gets an owner and a due date, and everyone sees the same list.' },
      { title: 'Set the pickups', text: 'Type your trash and recycling days, or photograph the hauler’s flyer. Bin night is never a surprise again.' },
      { title: 'Look once a day', text: 'What is due inside, what the day is like outside, and what is happening around you, on one screen.' },
    ],
  },
  privacy: {
    title: (
      <>
        Who sees <em>your household’s day?</em>
      </>
    ),
    quote: 'Your household’s tasks are for your household. A shared sky shows your city, never your street.',
    items: [
      { title: 'Tasks stay in the home.', text: 'A household’s tasks and due dates show only to its members.' },
      { title: 'A city’s Today keeps your spot to you.', text: 'Your location is rounded to about a kilometer and kept on your phone.' },
      { title: 'Shared pictures show the city.', text: 'A sky you share never names your street.' },
      { title: 'Briefings are yours alone,', text: 'and a quiet day sends none.' },
    ],
  },
  questions: {
    title: (
      <>
        What people ask about <em>running a home</em>
      </>
    ),
    items: [
      {
        q: 'Is there an app where everyone at home sees the household tasks?',
        a: 'Yes. Today lists what is due at your home, and everyone in the household sees the same tasks, each with an owner and a due date. Tasks can repeat and carry photos.',
      },
      {
        q: 'How do I get a reminder for trash pickup day?',
        a: 'Set your pickup days in Today, or photograph your hauler’s flyer and the days fill in. The reminder comes in the evening briefing, the night before.',
      },
      {
        q: 'How do I check the air quality at my address?',
        a: 'Today shows the reading from the nearest AirNow monitor and names it, or says so when the number is an estimate.',
      },
      {
        q: 'Does Today work before I add my home?',
        a: 'Yes. Use your location to see a city’s weather, air, alerts and headlines. Adding your home brings its calendar and the household’s tasks.',
      },
      {
        q: 'Will it send me notifications all day?',
        a: 'No. A morning and an evening briefing at most, and only when there is something useful to say.',
      },
      {
        q: 'What is in Around you?',
        a: 'Local headlines from outlets in your area, events, the season and on this day, each linked to where it was published. Crime, obituaries and party politics are left out.',
      },
      {
        q: 'Is Today on the web too?',
        a: 'Yes, on the web, iPhone and Android, the living sky included. The widgets and the flyer photo are on the phones.',
      },
    ],
  },
  related: ['place', 'mail', 'plans'],
  close: {
    title: (
      <>
        The sky over your own house, <em>and the day under it.</em>
      </>
    ),
    text: 'Start with your address. Today follows from it.',
  },
};
