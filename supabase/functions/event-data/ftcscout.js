// Turning FTCScout's data into Offline Scout's tables (events, event_teams,
// event_matches). Plain JavaScript with no imports, so the server function
// (Deno) and the tests (Node, tests/ftcscout.test.js) can both use it.
// FTCScout: https://ftcscout.org — free, public FTC data; no key needed.

export const FTCSCOUT_URL = 'https://api.ftcscout.org/graphql';

export const SEARCH_QUERY = `query Search($season: Int!, $text: String) {
  eventsSearch(season: $season, searchText: $text, limit: 15) {
    code name start end type location { city state country }
  }
}`;

// The scores field is a different type each season (MatchScores2025, …), so the
// query is built for the season; without a scores type it skips scores.
export function eventQuery(scoresType) {
  const scores = scoresType
    ? `scores { ... on ${scoresType} { red { totalPoints } blue { totalPoints } } }`
    : '';
  return `query Event($season: Int!, $code: String!) {
    eventByCode(season: $season, code: $code) {
      code name start end timezone location { city state country }
      teams { teamNumber team { name } }
      matches { matchNum series tournamentLevel scheduledStartTime hasBeenPlayed
        teams { teamNumber alliance station } ${scores} }
    }
  }`;
}

const STATION = { One: 0, Two: 1, Three: 2 };

// One FTCScout match → one event_matches row.
export function toMatchRow(m, eventId) {
  const red = [];
  const blue = [];
  for (const t of m.teams ?? []) {
    const list = t.alliance === 'Red' ? red : blue;
    list[STATION[t.station] ?? list.length] = t.teamNumber;
  }
  const qual = m.tournamentLevel === 'Quals';
  return {
    event_id: eventId,
    level: qual ? 'qual' : 'playoff',
    // Playoff series ("P3") can have several games; quals are one game each.
    number: qual ? m.matchNum : (m.series || m.matchNum),
    game: qual ? 1 : (m.series ? m.matchNum : 1),
    scheduled_at: m.scheduledStartTime ?? null,
    red: red.filter((n) => n != null),
    blue: blue.filter((n) => n != null),
    red_score: m.scores?.red?.totalPoints ?? null,
    blue_score: m.scores?.blue?.totalPoints ?? null,
    played: Boolean(m.hasBeenPlayed),
  };
}

// The whole event → the rows to save.
export function toRows(e, { season }) {
  const event = {
    program: 'FTC',
    season,
    code: e.code,
    name: e.name,
    starts_on: e.start ?? null,
    ends_on: e.end ?? null,
    timezone: e.timezone ?? null,
    city: [e.location?.city, e.location?.state].filter(Boolean).join(', ') || null,
    region: e.location?.country ?? null,
  };
  const teams = (e.teams ?? []).map((t) => ({ team_number: t.teamNumber, team_name: t.team?.name ?? null }));
  return { event, teams, matches: e.matches ?? [] };
}

// A search result → what the app shows in the event picker.
export function toSearchResult(e) {
  return {
    code: e.code,
    name: e.name,
    starts_on: e.start,
    ends_on: e.end,
    type: e.type,
    city: [e.location?.city, e.location?.state].filter(Boolean).join(', '),
  };
}
