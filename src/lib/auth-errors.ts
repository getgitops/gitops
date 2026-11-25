/**
 * Las acciones de /auth devuelven mensajes fijos en inglés; los conocidos se traducen en la
 * página. Los que llegan de los servicios (dinámicos) se muestran tal cual.
 */
const KNOWN: Record<string, string> = {
  'Invalid email or password.': 'auth.errors.invalidCredentials',
  'Email and password are required.': 'auth.errors.missingCredentials',
  'Passwords do not match.': 'auth.errors.passwordMismatch',
  'Registration is disabled.': 'auth.registrationDisabled',
};

export function authErrorMessage(message: string, t: (key: string) => string): string {
  const key = KNOWN[message];
  return key ? t(key) : message;
}
