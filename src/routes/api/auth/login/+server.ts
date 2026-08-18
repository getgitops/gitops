import { json } from '@sveltejs/kit';
import { authService, ensureAuthReady } from '../../../../modules/auth';

export async function POST({ request, cookies }) {
  try {
    await ensureAuthReady();

    const contentType = request.headers.get('content-type') || '';
    let username = '';
    let password = '';

    if (contentType.includes('application/json')) {
      const payload = await request.json();
      username = String(payload?.username || '');
      password = String(payload?.password || '');
    } else {
      const formData = await request.formData();
      username = String(formData.get('username') || '');
      password = String(formData.get('password') || '');
    }

    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    const user = await authService.authenticate(username, password);
    if (!user) {
      throw new Error('Invalid username or password');
    }

    const sessionToken = authService.createSessionToken(user.id);

    cookies.set('pos_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
    });

    return json({ success: true });
  } catch {
    return json({ error: 'Invalid username or password' }, { status: 401 });
  }
}
