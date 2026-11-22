import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { plans, posts } from '@pantopus/api';
import { fieldClass, plansPath, secondaryClass, usePlansArea } from './PlansWorkspace';
import { localInput } from './PlanScheduleFields';

function useGames(purpose: 'composer' | 'sheet', enabled = true) {
  const { point, gps } = usePlansArea();
  return useQuery({
    queryKey: ['plans', 'games', purpose, point, gps],
    queryFn: () => plans.games(purpose, point, gps),
    enabled,
    retry: false,
  });
}
function matchup(g: plans.Game) {
  return [
    g.label,
    g.opponent ? (g.home === false ? 'at ' : 'vs ') + g.opponent : '',
    new Date(g.starts_at).toLocaleString(),
  ]
    .filter(Boolean)
    .join(' · ');
}
export function GameField({ original }: { original?: plans.KindDetails['game'] }) {
  const games = useGames('composer');
  const requested = useSearchParams().get('game');
  const sheet = useGames('sheet', !!requested);
  const options = games.data?.games || [];
  const fromSheet = sheet.data?.games.find((game) => game.id === requested);
  const available =
    fromSheet && !options.some((game) => game.id === requested) ? [fromSheet, ...options] : options;
  const [choice, setChoice] = useState(original?.id || requested || '');
  const [manual, setManual] = useState(original?.label || '');
  const [touched, setTouched] = useState(false);
  const field = useRef<HTMLSelectElement>(null);
  const autoTitle = useRef('');
  const applied = useRef('');
  const chosen = available.find((g) => g.id === choice);
  useEffect(() => {
    const form = field.current?.form;
    if (!chosen || !form || applied.current === chosen.id || (!touched && requested !== chosen.id)) return;
    applied.current = chosen.id;
    const quarter = 15 * 60_000;
    const now = Date.now();
    const scheduled = Date.parse(chosen.starts_at);
    const startTime = scheduled > now ? scheduled : Math.ceil((now + 5 * 60_000) / quarter) * quarter;
    const endTime = chosen.ends_at ? Date.parse(chosen.ends_at) : startTime + 200 * 60_000;
    const start = form.elements.namedItem('start'),
      duration = form.elements.namedItem('duration');
    if (start instanceof HTMLInputElement) start.value = localInput(new Date(startTime).toISOString());
    if (duration instanceof HTMLInputElement)
      duration.value = String(Math.min(480, Math.max(15, Math.round((endTime - startTime) / 60_000))));
    const title = form.elements.namedItem('title');
    if (title instanceof HTMLInputElement && (!title.value || title.value === autoTitle.current)) {
      autoTitle.current = chosen.label + ' game on the big screen';
      title.value = autoTitle.current;
    }
  }, [chosen, requested, touched]);
  return (
    <>
      {!!available.length && (
        <label className="block text-sm font-medium">
          Upcoming games
          <select
            ref={field}
            name="gameSelection"
            className={fieldClass}
            value={chosen?.id || ''}
            onChange={(e) => {
              applied.current = '';
              setChoice(e.target.value);
              setTouched(true);
            }}
          >
            <option value="">Another game</option>
            {available.map((g) => (
              <option key={g.id} value={g.id}>
                {matchup(g)}
              </option>
            ))}
          </select>
        </label>
      )}
      {chosen ? (
        <input
          type="hidden"
          name="scheduledGame"
          value={JSON.stringify({
            id: chosen.id,
            label: chosen.label,
            team: chosen.team,
            opponent: chosen.opponent,
            home: chosen.home,
            starts_at: chosen.starts_at,
            ends_at: chosen.ends_at,
          })}
        />
      ) : (
        <label className="block text-sm font-medium">
          What are you watching? (optional)
          <input
            name="game"
            className={fieldClass}
            maxLength={60}
            value={manual}
            onChange={(e) => {
              setManual(e.target.value);
              setTouched(true);
            }}
          />
        </label>
      )}
      {touched && !chosen && <input type="hidden" name="manualGame" value="1" />}
    </>
  );
}

export function PlanSports() {
  const games = useGames('sheet');
  const [edit, setEdit] = useState(false);
  if (!games.data || (!games.data.sports?.can_choose && !games.data.games.length)) return null;
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">Watch parties</h2>
      {games.data.games.map((g) => (
        <Link
          className="block text-sm text-primary-700"
          key={g.id}
          href={plansPath + '/new?game=' + encodeURIComponent(g.id)}
        >
          Host a watch party · {matchup(g)}
        </Link>
      ))}
      {games.data.sports?.attribution && <p className="text-xs">{games.data.sports.attribution}</p>}
      {games.data.sports?.can_choose && (
        <button className={secondaryClass} aria-expanded={edit} onClick={() => setEdit(!edit)}>
          Edit teams
        </button>
      )}
      {edit && <TeamPreferences />}
    </section>
  );
}
function TeamPreferences() {
  const { point } = usePlansArea(),
    client = useQueryClient();
  const [query, setQuery] = useState('');
  const prefs = useQuery({
    queryKey: ['plans', 'sports-preferences'],
    queryFn: posts.getFeedPreferences,
    gcTime: 0,
  });
  const teams = useQuery({
    queryKey: ['plans', 'teams', point, query],
    queryFn: () => plans.teams(query, point),
  });
  const sports = prefs.data?.preferences.sports || {};
  const change = useMutation({
    mutationFn: (patch: posts.SportsPreferences) =>
      posts.updateFeedPreferences({ sports: patch, expected_sports: sports }),
    onSettled: () => client.invalidateQueries({ queryKey: ['plans'] }),
  });
  const busy = !prefs.data || prefs.isError || change.isPending;
  function toggle(key: 'teams' | 'hidden' | 'leagues', id: string) {
    const current = sports[key] || [];
    change.mutate({
      [key]: current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
      ...(key === 'hidden' ? {} : { watch: 'on' as const }),
    });
  }
  const choices = new Map((teams.data?.results || []).map((t) => [t.id, t]));
  if (!query) for (const t of teams.data?.suggested || []) choices.set(t.id, t);
  return (
    <fieldset disabled={busy} className="space-y-2 rounded-xl border border-app p-3">
      <legend className="font-medium">Teams and leagues</legend>
      <label className="block">
        <input
          type="checkbox"
          checked={sports.watch === 'off'}
          onChange={(e) => change.mutate({ watch: e.target.checked ? 'off' : 'on' })}
        />{' '}
        Not into sports
      </label>
      <label className="block">
        Find a team
        <input
          className={fieldClass}
          value={query}
          maxLength={100}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {[...choices.values()].map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-3 text-sm">
          <label>
            <input
              type="checkbox"
              checked={sports.teams?.includes(t.id) || false}
              onChange={() => toggle('teams', t.id)}
            />{' '}
            {t.name}
          </label>
          <button className="text-primary-700" onClick={() => toggle('hidden', t.id)}>
            {sports.hidden?.includes(t.id) ? 'Unhide' : 'Hide'} {t.label}
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-3">
        {['nfl', 'nba', 'wnba', 'mlb', 'nhl', 'mls', 'nwsl', 'ncaaf'].map((l) => (
          <label key={l}>
            <input
              type="checkbox"
              checked={sports.leagues?.includes(l) || false}
              onChange={() => toggle('leagues', l)}
            />{' '}
            {l === 'ncaaf' ? 'College football' : l.toUpperCase()}
          </label>
        ))}
      </div>
      {(change.error || prefs.error || teams.error) && (
        <p role="alert">{(change.error || prefs.error || teams.error)?.message}</p>
      )}
    </fieldset>
  );
}
