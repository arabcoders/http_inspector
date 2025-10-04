type Subscriber = { id: string; send: (data: string) => void };

const tokenSubs = new Map<string, Map<string, Subscriber>>();
const sessionSubs = new Map<string, Map<string, Subscriber>>();

export const subscribeToToken = (token: string, sub: Subscriber) => {
  let map = tokenSubs.get(token);
  if (!map) {
    map = new Map();
    tokenSubs.set(token, map);
  }
  map.set(sub.id, sub);
}

export const unsubscribeFromToken = (token: string, id: string) => tokenSubs.get(token)?.delete(id);

export const subscribeToSession = (sessionId: string, sub: Subscriber) => {
  let map = sessionSubs.get(sessionId);
  if (!map) {
    map = new Map();
    sessionSubs.set(sessionId, map);
  }
  map.set(sub.id, sub);
}

export const unsubscribeFromSession = (sessionId: string, id: string) => {
  sessionSubs.get(sessionId)?.delete(id);
  if (sessionSubs.get(sessionId)?.size === 0) {
    sessionSubs.delete(sessionId);
  }
}

export const publish = (token: string, payload: unknown) => {
  const message = JSON.stringify({ ...payload as object, token });
  const map = tokenSubs.get(token);
  if (map) {
    for (const sub of map.values()) {
      try {
        sub.send(message);
      } catch (err) {
        console.warn('event send failed', err)
      }
    }
  }
}

export const publishGlobal = (sessionId: string, payload: unknown) => {
  const message = JSON.stringify(payload);
  const map = sessionSubs.get(sessionId);
  if (map) {
    for (const sub of map.values()) {
      try {
        sub.send(message);
      } catch (err) {
        console.warn('event send failed', err)
      }
    }
  }
}
