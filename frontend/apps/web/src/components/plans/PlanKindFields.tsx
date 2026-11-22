import { plans } from '@pantopus/api';
import { fieldClass } from './PlansWorkspace';

export const ages = { under_2: 'Under 2', '2_3': '2–3', '4_5': '4–5', '6_8': '6–8', '9_12': '9–12' };
export function labelFor(key: string) {
  const label = key.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}
type Choice =
  | 'food_kind'
  | 'game_kind'
  | 'outdoor_kind'
  | 'pace'
  | 'level'
  | 'sport'
  | 'walk_kind'
  | 'study_style';
const choices: Record<Choice, [string, string[]]> = {
  food_kind: ['Kind of get-together', ['dinner', 'potluck', 'drinks', 'brunch', 'bbq', 'other']],
  game_kind: ['Kind of game', ['board_games', 'cards', 'trivia', 'video_games', 'other']],
  outdoor_kind: ['Activity', ['hike', 'bike_ride', 'run', 'other']],
  pace: ['Pace', ['easy', 'brisk']],
  level: ['Skill level', ['any', 'casual', 'competitive']],
  sport: ['Sport', ['pickleball', 'basketball', 'soccer', 'tennis', 'volleyball', 'running', 'other']],
  walk_kind: ['Activity', ['walk', 'coffee', 'dog_walk', 'stroller_walk']],
  study_style: ['Study style', ['quiet', 'together']],
};
const fields: Partial<Record<plans.Kind, Choice[]>> = {
  food_drinks: ['food_kind'],
  game_night: ['game_kind'],
  outdoors: ['outdoor_kind', 'pace'],
  walk_coffee: ['walk_kind', 'pace'],
  pickup_game: ['sport', 'level'],
  study_group: ['study_style'],
};

export function readKindDetails(kind: plans.Kind, data: FormData, original: plans.KindDetails = {}) {
  const details = { ...original };
  for (const name of fields[kind] || []) details[name] = String(data.get(name));
  if (kind === 'pickup_game') details.extra_gear = data.has('extra_gear');
  if (kind === 'walk_coffee') details.dogs_welcome = data.has('dogs_welcome');
  if (kind === 'study_group') details.subject = String(data.get('subject') || '').trim();
  if (kind === 'playdate') {
    details.kids_age_bands = data.getAll('ages').map(String);
    if (!details.kids_age_bands.length) throw new Error('Choose at least one age group for the playdate.');
  }
  if (kind === 'watch_party') {
    const label = String(data.get('game') || '').trim();
    if (label !== (original.game?.label || '')) details.game = label ? { label } : undefined;
  }
  return details;
}

export default function PlanKindFields({
  kind,
  details = {},
}: {
  kind: plans.Kind;
  details?: plans.KindDetails;
}) {
  return (
    <>
      {(fields[kind] || []).map((name) => (
        <label key={name} className="block text-sm font-medium">
          {choices[name][0]}
          <select name={name} className={fieldClass} defaultValue={details[name]}>
            {choices[name][1].map((v) => (
              <option key={v} value={v}>
                {v === 'bbq' ? 'Barbecue' : labelFor(v)}
              </option>
            ))}
          </select>
        </label>
      ))}
      {kind === 'watch_party' && (
        <label className="block text-sm font-medium">
          What are you watching? (optional)
          <input name="game" className={fieldClass} maxLength={60} defaultValue={details.game?.label} />
        </label>
      )}
      {kind === 'study_group' && (
        <label className="block text-sm font-medium">
          What are you studying?
          <input
            name="subject"
            className={fieldClass}
            maxLength={60}
            defaultValue={details.subject}
            required
          />
        </label>
      )}
      {kind === 'pickup_game' && (
        <label className="block">
          <input type="checkbox" name="extra_gear" defaultChecked={details.extra_gear} /> I have extra gear
        </label>
      )}
      {kind === 'walk_coffee' && (
        <label className="block">
          <input type="checkbox" name="dogs_welcome" defaultChecked={details.dogs_welcome} /> Dogs welcome
        </label>
      )}
      {kind === 'playdate' && (
        <fieldset>
          <legend>Kids’ ages</legend>
          <div className="flex flex-wrap gap-3">
            {Object.entries(ages).map(([v, label]) => (
              <label key={v}>
                <input
                  name="ages"
                  type="checkbox"
                  value={v}
                  defaultChecked={details.kids_age_bands?.includes(v)}
                />{' '}
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </>
  );
}
