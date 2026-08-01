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

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in to Expo
eas login

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android

# Submit to App Store
eas submit --platform ios

# Submit to Play Store
eas submit --platform android
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

**Source-map upload is not enabled.** The `@sentry/react-native/expo` config
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
