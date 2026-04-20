import {
  signGoogleOAuthState,
  verifyGoogleOAuthState,
} from './sign-google-oauth-state';

describe('signGoogleOAuthState', () => {
  const secret = 'test-secret-at-least-32-chars-long!!';

  it('round-trips userId and appRedirect', () => {
    const state = signGoogleOAuthState(secret, 'user-uuid-1', 'pem://callback');
    const out = verifyGoogleOAuthState(secret, state);
    expect(out.userId).toBe('user-uuid-1');
    expect(out.appRedirect).toBe('pem://callback');
  });

  it('rejects tampered state', () => {
    const state = signGoogleOAuthState(secret, 'user-a', '');
    const tampered = `${state.slice(0, -4)}xxxx`;
    expect(() => verifyGoogleOAuthState(secret, tampered)).toThrow(
      'Invalid OAuth state',
    );
  });

  it('rejects wrong secret', () => {
    const state = signGoogleOAuthState(secret, 'user-a', '');
    expect(() =>
      verifyGoogleOAuthState('other-secret-other-secret-other', state),
    ).toThrow('Invalid OAuth state');
  });
});
