import { json } from '@sveltejs/kit';
import { getController } from '$lib/server/runtime';

export async function POST() {
  const controller = getController();
  if (!controller?.voice) {
    return json({ error: 'No voice controller active' }, { status: 409 });
  }

  try {
    await controller.voice.sendInitializationMessage(controller.config);
    return json({ ok: true });
  } catch (e) {
    console.error(`Voice controller reinit failed: ${e}`);
    return json(
      { error: `Voice controller reinit failed: ${e instanceof Error ? e.message : e}` },
      { status: 502 }
    );
  }
}
