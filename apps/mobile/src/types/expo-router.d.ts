declare module 'expo-router' {
  export function useRouter(): {
    push(input: string | { pathname: string; params?: Record<string, string | number | undefined> }): void;
    back(): void;
  };

  export function useLocalSearchParams<T extends Record<string, unknown>>(): T;
}
