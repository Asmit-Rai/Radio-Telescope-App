import { Stack } from 'expo-router';
import { StatusBar } from 'react-native';
import 'react-native-reanimated';
import "../global.css";
import { BLEProvider } from 'context/BLEContext';

export default function RootLayout() {
 
  return (
   <BLEProvider>
    <StatusBar hidden={true} />
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
   </BLEProvider>
  );
}