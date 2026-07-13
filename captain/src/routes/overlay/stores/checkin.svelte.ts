import type { CheckInClearResponse, CheckInResponse } from '../checkinInterface';

export function createCheckInStore(receiver: WebSocket) {
  let checkInsLeft = $state<CheckInResponse[]>([]);
  let subscribers: Array<(value: CheckInResponse[]) => void> = [];

  function updateAllSubscribers() {
    subscribers.forEach((subscriber) => subscriber(checkInsLeft));
  }

  function addCheckInResponse(response: CheckInResponse) {
    checkInsLeft = [...checkInsLeft, response];
    updateAllSubscribers();
  }

  function addCheckInClearResponse(response: CheckInClearResponse) {
    checkInsLeft = checkInsLeft.filter((r) => r.username !== response.username);
    updateAllSubscribers();
  }

  receiver.addEventListener('message', (message_event) => {
    const data = JSON.parse(message_event.data);
    if ('type' in data) {
      switch (data['type']) {
        case 'checkincleared':
          addCheckInClearResponse(data as CheckInClearResponse);
          break;

        case 'checkinresponse':
          addCheckInResponse(data as CheckInResponse);
          break;

        default:
          console.log('unknown message in bus, ignoring...');
      }
    }
  });

  function subscribe(subscription: (value: CheckInResponse[]) => void): () => void {
    subscribers.push(subscription);
    subscription(checkInsLeft);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  return {
    get checkInsLeft() {
      return checkInsLeft;
    },
    addCheckInClearResponse,
    addCheckInResponse,
    subscribe
  };
}
