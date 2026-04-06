import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, getDefaultConfig } from 'connectkit';
import { Attribution } from 'ox/erc8021';

// Base Builder Code Attribution (ERC-8021)
// This automatically appends your Builder Code to ALL transactions
const BUILDER_CODE = 'bc_qupdabmv';

const DATA_SUFFIX = Attribution.toDataSuffix({
  codes: [BUILDER_CODE],
});

const config = createConfig(
  getDefaultConfig({
    chains: [base],
    transports: {
      [base.id]: http(import.meta.env.VITE_BASE_RPC || 'https://mainnet.base.org'),
    },
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '1ac6d1d1473a81fef1a18f15ccf1dc52',
    appName: 'Humble Hero',
    appDescription: 'Fast-paced multiplayer reaction game on Base',
    appUrl: 'https://humblehero.xyz',
    appIcon: 'https://humblehero.xyz/logo.png',

    // Builder Code: Appends your code to every transaction for Base analytics
    dataSuffix: DATA_SUFFIX,
  })
);

const queryClient = new QueryClient();

export default function WalletProvider({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="midnight"
          options={{
            hideBalance: false,
            hideTooltips: false,
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}