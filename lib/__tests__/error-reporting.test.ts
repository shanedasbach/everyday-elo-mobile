import { reportUnhandledError } from '../error-reporting';

describe('reportUnhandledError', () => {
  it('logs the error tagged with its source', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');

    reportUnhandledError(error, { source: 'unhandledRejection' });

    expect(spy).toHaveBeenCalledWith('[unhandled:unhandledRejection]', error);
    spy.mockRestore();
  });
});
