import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Modal,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { Feather } from "@expo/vector-icons";

// Lazy-load react-native-webview so the module doesn't crash in Expo Go or
// any environment where the native binary doesn't include RNCWebViewModule.
let WebViewComponent: React.ComponentType<any> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("react-native-webview") as { WebView: React.ComponentType<any> };
  WebViewComponent = mod.WebView;
} catch {
  // Not available in Expo Go — payment WebView silently disabled
}

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: (helcimTransactionId: string, amountCents: number) => void;
  getToken: () => Promise<string | null>;
}

// JavaScript injected into the Helcim payment page to forward postMessage events.
const INJECT_JS = `
(function() {
  var _orig = window.postMessage.bind(window);
  window.addEventListener('message', function(e) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(e.data));
    }
  });
  true;
})();
`;

export default function HelcimPayWebView({ visible, onClose, onSuccess, getToken }: Props) {
  const colors = useColors();
  const [checkoutToken, setCheckoutToken] = useState<string | null>(null);
  const [secretToken, setSecretToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageLoaded, setPageLoaded] = useState(false);
  const hasHandledRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setCheckoutToken(null);
      setSecretToken(null);
      setLoading(true);
      setError(null);
      setPageLoaded(false);
      hasHandledRef.current = false;
      return;
    }

    void (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${getApiBase()}/api/payment/helcim-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) {
          const d = (await res.json()) as { error?: string };
          setError(d.error ?? "Could not initialize payment");
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { checkoutToken?: string; secretToken?: string };
        setCheckoutToken(data.checkoutToken ?? null);
        setSecretToken(data.secretToken ?? null);
        setLoading(false);
      } catch {
        setError("Network error — please try again");
        setLoading(false);
      }
    })();
  }, [visible, getToken]);

  function handleMessage(event: { nativeEvent: { data: string } }) {
    if (hasHandledRef.current) return;
    try {
      const raw = event.nativeEvent.data;
      const msg = typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : (raw as Record<string, unknown>);
      const type = msg?.eventName ?? msg?.type;
      if (type === "transaction") {
        const txData = (msg?.eventData ?? msg) as Record<string, unknown>;
        const nested = txData?.data as Record<string, unknown> | undefined;
        const txId = String(txData?.transactionId ?? nested?.transactionId ?? "");
        const amount = Number(txData?.amount ?? nested?.amount ?? 20);
        if (txId) {
          hasHandledRef.current = true;
          onSuccess(txId, Math.round(amount * 100));
        }
      }
    } catch {
      // Ignore non-JSON messages
    }
  }

  const helcimUrl = checkoutToken
    ? `https://secure.helcim.app/helcim-pay/?checkoutToken=${checkoutToken}&secretToken=${secretToken ?? ""}`
    : null;

  const canShowWebView = Platform.OS !== "web" && WebViewComponent !== null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.foreground, fontFamily: "Inter_600SemiBold" }]}>
            Secure Payment
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={[styles.loadingText, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Preparing secure payment...
            </Text>
          </View>
        )}

        {error && !loading && (
          <View style={styles.center}>
            <Feather name="alert-circle" size={36} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.foreground, fontFamily: "Inter_500Medium" }]}>
              {error}
            </Text>
            <TouchableOpacity onPress={onClose} style={[styles.retryBtn, { backgroundColor: colors.primary }]}>
              <Text style={[styles.retryText, { color: colors.primaryForeground, fontFamily: "Inter_600SemiBold" }]}>
                Go Back
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {helcimUrl && !loading && !error && canShowWebView && WebViewComponent && (
          <WebViewComponent
            source={{ uri: helcimUrl }}
            onMessage={handleMessage}
            injectedJavaScript={INJECT_JS}
            onLoadStart={() => setPageLoaded(false)}
            onLoad={() => setPageLoaded(true)}
            style={{ flex: 1, opacity: pageLoaded ? 1 : 0 }}
            javaScriptEnabled
            domStorageEnabled
          />
        )}

        {helcimUrl && !loading && !error && !canShowWebView && (
          <View style={styles.center}>
            <Text style={[styles.webNote, { color: colors.mutedForeground, fontFamily: "Inter_400Regular" }]}>
              Please use the production app to complete payment.
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 17 },
  closeBtn: { padding: 4 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 16, paddingHorizontal: 32 },
  loadingText: { fontSize: 14, marginTop: 8 },
  errorText: { fontSize: 16, textAlign: "center" },
  retryBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  retryText: { fontSize: 15 },
  webNote: { fontSize: 15, textAlign: "center" },
});
