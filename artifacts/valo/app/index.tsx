import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#F7F5F2" }}>
        <ActivityIndicator color="#C17B3F" />
      </View>
    );
  }

  if (isSignedIn) {
    return <Redirect href="/(tabs)/today" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
