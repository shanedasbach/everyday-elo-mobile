/**
 * App-startup side effects, in one importable place.
 *
 * `app/_layout.tsx` is outside the jest `testMatch` glob, so a call made
 * directly there is untestable — deleting it would leave the suite green and
 * the app shipping without crash reporting. Keeping the call here means
 * `lib/__tests__/bootstrap.test.ts` can assert it actually runs on import.
 *
 * Import for side effects only: `import '../lib/bootstrap';`
 */
import { initMonitoring } from './monitoring';

// Initialize crash reporting before anything else runs so early errors are
// captured. No-ops in development and when no DSN is configured.
export const monitoringStatus = initMonitoring();
