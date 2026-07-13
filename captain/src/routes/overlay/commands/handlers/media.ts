import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import { checkCostAddIfEnough } from '../middleware';
import { requireUsername } from './shared';
import * as Constants from '../../constants';
import { showImageStore, playAudioStore, karmaStore } from '../../stores';
import { ApprovableObserver } from '../../approvable';
import { isTagExist, getAttachmentUrlForTag, registerTag } from '$lib/api/attachments';

interface MediaConfig {
  kind: 'image' | 'audio';
  cost: number;
  karma: number;
  freeUser: string;
}

export async function mediaHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  config: MediaConfig
) {
  const username = requireUsername(message);
  if (!username) return;

  const store = config.kind === 'image' ? showImageStore : playAudioStore;
  const karmaLabel = config.kind === 'image' ? 'Show Image' : 'Play Audio';

  const args = message.text.replaceAll('  ', ' ').split(' ').slice(1);
  if (args.length < 1) {
    dispatcher.sendMessageAsUser(message.channelId!, 'insufficient arguments', message.id);
    return;
  }

  let url = args[0];
  let optionalTagName = args.at(1);
  const isTag = !url.startsWith('http');
  if (isTag && url.startsWith('{') && url.endsWith('}')) {
    url = url.slice(1, -1);
  }

  if (isTag) {
    if (await isTagExist(url)) {
      url = getAttachmentUrlForTag(url);
      optionalTagName = undefined;
    } else {
      dispatcher.sendMessageAsUser(message.channelId!, 'that tag probably doesnt exist', message.id);
      return;
    }
  }

  const addUrl = async () => {
    store.addUrl(url);
    karmaStore.updateKarma(config.karma, karmaLabel);
    try {
      if (optionalTagName) await registerTag(optionalTagName, url);
    } catch (e) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `cannot add tag ${config.kind}: ${e}`,
        message.id
      );
    }
  };

  if (username === config.freeUser) {
    dispatcher.sendMessageAsUser(message.channelId!, 'ok', message.id);
    await addUrl();
    return;
  }

  if (
    !(await checkCostAddIfEnough(
      dispatcher,
      message.channelId!,
      username,
      -config.cost,
      undefined,
      message.id
    ))
  )
    return;
  dispatcher.sendMessageAsUser(message.channelId!, `-${config.cost}`, message.id);

  if (message.userInfo.isMod || message.userInfo.isBroadcaster || isTag) {
    await addUrl();
  } else {
    const approverObserver = new ApprovableObserver(
      dispatcher,
      message,
      [config.freeUser],
      () => addUrl(),
      () => dispatcher.sendMessageAsUser(message.channelId!, 'unfortunate', message.id)
    );
    dispatcher.addObserver(approverObserver);
  }
}
