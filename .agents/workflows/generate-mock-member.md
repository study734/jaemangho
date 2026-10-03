# Workflow: Generate Mock Squad Member

This workflow automates the creation of a realistic mock player member, complete with detailed match histories, custom active games, and champion masteries conforming to the Jaemangho type definitions.

## Activation Trigger
- Command: `/generate-mock-member`
- Usage: `/generate-mock-member <name> <tag> <main champion> <tier/rank>`

## Steps to Execute

### 1. Parse and Validate Arguments
- Read the arguments provided:
  - `<name>`: The user's mock game name (e.g. `티모는나의동반자`)
  - `<tag>`: The tagline (e.g. `KR1`)
  - `<main champion>`: Main played champion (e.g. `Teemo`)
  - `<tier/rank>`: Target rank (e.g. `GOLD III` or `DIAMOND I`)
- Reference [src/features/lol/types.ts](file:///c:/Users/zes13/OneDrive/Dokumen/Jaemangho/src/features/lol/types.ts) to verify the data schemas for `Member`, `MatchHistory`, and `ChampionMastery`.

### 2. Formulate Member Object Structure
Construct a fresh `Member` object with the following:
- `id`: A random string (e.g. via `Math.random().toString(36).substring(2, 9)`).
- `gameName` and `tagLine`.
- `summonerLevel`: A realistic level (e.g. 80 to 450).
- `profileIconId`: A valid profile icon number.
- `tier` and `rank`: Upper-case (e.g. `DIAMOND` and `I`).
- `leaguePoints`: Between 0 and 99.
- `wins` and `losses`: A reasonable ratio representing the tier's winrate (e.g. 98 wins / 92 losses).
- `activeGame`: Initialized to `null` or a simulated active game structure.
- `championMasteries`: Array of top 3 masteries including the `<main champion>` and two other realistic champions.
- `matches`: A pre-filled list of 5 recent `MatchHistory` matches.

### 3. Generate Realistic Recent Matches
Create 5 matches in `matches` representing the member's performance:
- Alternate between Wins and Losses realistically.
- Match variables:
  - `gameMode`: `CLASSIC`
  - `gameDuration`: Between 1200 and 2100 seconds (20-35 mins).
  - `cs`: 120 - 240 (for mid/top/adc) or 20 - 50 (for supports).
  - `kills`, `deaths`, `assists`: Formulate reasonable KDAs based on win status. For supports, high assists; for carries, high kills.
  - `items`: 6 random valid high-tier item IDs (numbers from 3000 to 4000).

### 4. Append to `mockData.ts` or State Hydration
- Open [src/features/lol/mockData.ts](file:///c:/Users/zes13/OneDrive/Dokumen/Jaemangho/src/features/lol/mockData.ts) and locate `INITIAL_MEMBERS`.
- Add the generated member object to the `INITIAL_MEMBERS` array so it is loaded by default, or suggest inserting it directly into the active state in `src/App.tsx`.
