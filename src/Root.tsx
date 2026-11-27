import { View } from "react-native";
import App from "./App";
import { LaunchCurtain } from "./ui/launch/LaunchCurtain";

/** The app, with the launch curtain over it until the session settles. */
export default function Root() {
  return (
    <View style={{ flex: 1 }}>
      <App />
      <LaunchCurtain />
    </View>
  );
}
