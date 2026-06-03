type TokenListener = (token: string | null) => void;
let listeners: TokenListener[] = [];

let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
  accessToken = token;
  listeners.forEach(listener => listener(token));
};

export const getAccessToken = () => accessToken;

export const subscribeToTokenChanges = (listener: TokenListener) => {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
};
