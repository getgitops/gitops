import { json } from '@sveltejs/kit';
import { getConfig, saveConfig, type InstanceConfig } from '$lib/config';

export async function GET() {
  const config = await getConfig();

  if (!config) {
    return json({ configured: false });
  }

  const safeConfig = { ...config };
  if (safeConfig.googleClientSecret) safeConfig.googleClientSecret = '***';
  if (safeConfig.samlCert) safeConfig.samlCert = '***';

  return json({ configured: true, config: safeConfig });
}

export async function POST({ request }) {
  try {
    const newConfig = (await request.json()) as Partial<InstanceConfig>;
    const existing = (await getConfig()) || null;

    if (newConfig.googleClientSecret === '***') {
      newConfig.googleClientSecret = existing?.googleClientSecret || null;
    }

    if (newConfig.samlCert === '***') {
      newConfig.samlCert = existing?.samlCert || null;
    }

    await saveConfig(newConfig);
    return json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save config';
    return json({ error: message }, { status: 500 });
  }
}