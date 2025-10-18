export interface CheckInRequest {
  readonly type: 'checkinrequest';
  username: string;
}

export interface CheckInResponse {
  readonly type: 'checkinresponse';
  username: string;
  message: string;
}

export interface CheckInClearResponse {
  readonly type: 'checkincleared';
  username: string;
}

export async function checkinUser(username: string, sender: WebSocket) {
  const request = JSON.stringify({
    type: 'checkinrequest',
    username
  } as CheckInRequest);

  sender.send(request);
}
