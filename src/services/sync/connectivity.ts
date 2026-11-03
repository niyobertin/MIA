import NetInfo from '@react-native-community/netinfo';
import { getApiBaseUrl } from '@/lib/api';

let configured = false;

export function configureConnectivity(): void {
  if (configured) return;
  configured = true;
  const apiUrl = getApiBaseUrl();
  if (!apiUrl) return;
  NetInfo.configure({
    reachabilityUrl: `${apiUrl}/health`,
    reachabilityMethod: 'GET',
    reachabilityTest: async (response) => response.status === 200,
    reachabilityShortTimeout: 15 * 1000,
    reachabilityLongTimeout: 60 * 1000,
    reachabilityRequestTimeout: 10 * 1000,
    useNativeReachability: false,
  });
}
