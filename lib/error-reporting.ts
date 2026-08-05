// Single funnel for errors that never reach a try/catch — unhandled promise
// rejections, event-handler throws, timer callbacks. React's render-phase
// error boundaries never see these, so nothing else in the app currently
// reports them anywhere production can see.
//
// TODO(#47/#63): forward to Sentry.captureException once crash reporting lands.
export function reportUnhandledError(error: unknown, context: { source: string }): void {
  console.error(`[unhandled:${context.source}]`, error);
}
