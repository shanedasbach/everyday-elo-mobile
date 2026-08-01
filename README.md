# Everyday Elo Mobile 📱🏆

iOS and Android app for Everyday Elo - rank anything with rapid-fire comparisons.

## Tech Stack

- **Framework:** Expo SDK 54
- **Navigation:** Expo Router
- **Language:** TypeScript
- **Backend:** Supabase (shared with web app)
- **Storage:** Expo SecureStore

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start Expo dev server
npx expo start

# Run on iOS simulator
npx expo run:ios

# Run on Android emulator
npx expo run:android
```

## Project Structure

```
app/
├── _layout.tsx           # Root layout with auth provider
├── (tabs)/               # Tab navigation
│   ├── _layout.tsx       # Tab bar configuration
│   ├── index.tsx         # Browse templates
│   ├── create.tsx        # Create new list
│   ├── my-lists.tsx      # User's lists
│   └── profile.tsx       # Profile & settings
├── (auth)/               # Auth screens (modals)
│   ├── sign-in.tsx
│   └── sign-up.tsx
└── rank/
    └── [id].tsx          # Ranking screen

lib/
├── auth-context.tsx      # Auth state management
├── elo.ts                # Elo algorithm (shared with web)
└── supabase.ts           # Supabase client config

components/
└── (shared components)
```

## Features

### MVP (Phase 1)
- [x] Browse template lists
- [x] A/B comparison ranking
- [x] Elo-based scoring
- [x] Results view
- [x] Auth (sign in/up)
- [x] Haptic feedback
- [ ] Create custom lists (UI done, needs backend)
- [ ] My Lists (needs backend)

### Phase 2
- [ ] Share list via link
- [ ] Share ranking as image
- [ ] Compare with friends
- [ ] Push notifications
- [ ] Offline mode

## Building for Production

Build profiles are defined in [eas.json](./eas.json):
- **development** — dev client, internal distribution, iOS simulator + Android APK
- **preview** — internal distribution (TestFlight internal / APK), production-like
- **production** — store distribution, auto-incremented build numbers, AAB on Android

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo
eas login

# Development build (dev client, simulator-friendly)
eas build --profile development --platform ios
eas build --profile development --platform android

# Preview build (internal distribution)
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Production build (store-ready)
eas build --profile production --platform ios
eas build --profile production --platform android

# Submit to App Store / Play Store
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

### One-time EAS account setup

These steps are manual and are not committed to the repo (no secrets in git):

1. **Create / link the Expo project**
   - `eas login` with the Expo account that should own the project
   - `eas init` from the repo root — this writes the real `extra.eas.projectId` into `app.json` (replacing the all-zero placeholder)
   - Set `owner` in `app.json` if the project should live under a different Expo org

2. **iOS — App Store Connect**
   - Enroll in the Apple Developer Program ($99/yr)
   - Create the app in App Store Connect with bundle identifier `com.everydayelo.app`
   - Update `submit.production.ios` in `eas.json` with the real `appleId` (email), `ascAppId` (App Store Connect app ID), and `appleTeamId`
   - Run `eas credentials` to let EAS manage the iOS distribution certificate + provisioning profile

3. **Android — Play Console**
   - Pay the one-time Google Play Developer fee ($25)
   - Create the app in Play Console with package `com.everydayelo.app`
   - Create a Google Cloud service account with the Play Developer API role, download the JSON key, save it locally as `play-store-service-account.json` (already gitignored — never commit)
   - Run `eas credentials` to let EAS manage the Android keystore

4. **OTA updates (optional, for `expo-updates`)**
   - Run `eas update:configure` — this replaces the placeholder `updates.url` in `app.json` with the real EAS Update URL
   - Publish updates per channel: `eas update --branch preview` / `eas update --branch production`

5. **Verify config without building**
   ```bash
   eas build:configure        # sanity-check eas.json + app.json
   eas build --profile preview --platform ios --dry-run
   ```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN for crash reporting (optional — unset disables it; also no-ops in dev) |

## Crash reporting

`lib/monitoring.ts` calls `Sentry.init` at startup (via `lib/bootstrap.ts`,
imported by `app/_layout.tsx`) whenever `EXPO_PUBLIC_SENTRY_DSN` is set and the
build is not a dev build. That is all the runtime needs — set the DSN and
crashes are reported.

The bootstrap import must stay the **first** import in `app/_layout.tsx`.
Module bodies evaluate in import order, so anything imported above it runs
before `Sentry.init` — including `lib/supabase.ts`, which throws at module init
when its env vars are missing. `lib/__tests__/bootstrap.test.ts` asserts the
ordering against the source so a reorder fails CI.

As an alternative to the env var, the DSN may be set as `expo.extra.sentryDsn`
in `app.json`; `EXPO_PUBLIC_SENTRY_DSN` wins when both are present.

**Source-map upload is not enabled** — tracked in
[#75](https://github.com/shanedasbach/everyday-elo-mobile/issues/75). The `@sentry/react-native/expo` config
plugin is deliberately absent from `app.json`: it runs `sentry-cli` on every
`expo prebuild` / `eas build` and fails the build unless a real Sentry
organization, project, and auth token exist. None do yet. Stack traces are
therefore minified until someone creates the Sentry project and then adds:

```jsonc
// app.json → expo.plugins
["@sentry/react-native/expo", { "organization": "<org-slug>", "project": "<project-slug>" }]
```

along with these **build-time** variables (they are secrets — set them in EAS,
not in `.env`, and never prefix them with `EXPO_PUBLIC_`):

| Variable | Description |
|----------|-------------|
| `SENTRY_AUTH_TOKEN` | Token with `project:releases` scope, used by `sentry-cli` to upload source maps |
| `SENTRY_ORG` | Sentry organization slug (if not set in the plugin config) |
| `SENTRY_PROJECT` | Sentry project slug (if not set in the plugin config) |

Setting `SENTRY_DISABLE_AUTO_UPLOAD=true` skips the upload step if the plugin
is present before the token is.

## Related

- [everyday-elo](https://github.com/shanedasbach/everyday-elo) - Web app
- [Expo Docs](https://docs.expo.dev/)
- [Supabase Docs](https://supabase.com/docs)
