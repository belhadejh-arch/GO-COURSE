import { createContext, useContext } from 'react';

export const AuthStatusContext = createContext({
  available: false,
  isLoaded: false,
  isSignedIn: false,
});

export const useAuthStatus = () => useContext(AuthStatusContext);
