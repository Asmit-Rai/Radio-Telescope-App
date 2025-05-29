import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';

const SOLAR_SYSTEM_IMAGE_URL = 'https://user-images.githubusercontent.com/18246306/266941422-11b6247a-d0e2-4236-a10a-894d5e577b15.png';
const PLANET_SURFACE_IMAGE_URL = 'https://user-images.githubusercontent.com/18246306/266941411-12a856d7-3c18-4623-9d08-46487c334c1b.png';

const SpaceConnectScreen = () => {
  return (
    <SafeAreaView className="flex-1 bg-black">
      <View className="flex-1 relative items-center">

        <View className="w-full items-center pt-10 sm:pt-12">
          <Image
            source={{ uri: SOLAR_SYSTEM_IMAGE_URL }}
            className="w-44 h-44 sm:w-48 sm:h-48 mb-6 sm:mb-8"
            resizeMode="contain"
          />
          <Text className="text-[36px] sm:text-[38px] font-bold text-center leading-tight" style={{ color: '#FF9D29' }}>
            Connect to
          </Text>
          <Text className="text-[36px] sm:text-[38px] font-bold text-center mb-10 sm:mb-12" style={{ color: '#FF9D29' }}>
            Radio Telescope
          </Text>

          <TouchableOpacity className="w-4/5 max-w-[320px] py-3.5 sm:py-4 rounded-full items-center mb-4 sm:mb-5" style={{ backgroundColor: '#FFB152' }}>
            <Text className="text-white text-base sm:text-lg font-semibold">Connect to Telescope</Text>
          </TouchableOpacity>

          <TouchableOpacity className="w-4/5 max-w-[320px] py-3.5 sm:py-4 rounded-full items-center" style={{ backgroundColor: '#FFB152' }}>
            <Text className="text-white text-base sm:text-lg font-semibold">Help</Text>
          </TouchableOpacity>
        </View>

        <Image source={{ uri: PLANET_SURFACE_IMAGE_URL }} className="absolute bottom-0 w-full h-1/4" resizeMode="cover" />

        <Text className="absolute text-white text-xl sm:text-2xl opacity-80" style={{ top: '5%', left: '12%' }}>*</Text>
        <Text className="absolute text-white text-xl sm:text-2xl opacity-80" style={{ top: '3%', right: '10%' }}>*</Text>
        <Text className="absolute text-white text-lg sm:text-xl opacity-80" style={{ top: '12%', left: '20%' }}>*</Text>
        <Text className="absolute text-white text-xl sm:text-2xl opacity-80" style={{ top: '38%', left: '8%' }}>*</Text>
        <Text className="absolute text-white text-xl sm:text-2xl opacity-80" style={{ top: '42%', right: '7%' }}>*</Text>
        <Text className="absolute text-white text-xl sm:text-2xl opacity-80" style={{ bottom: '28%', left: '10%' }}>*</Text>
        <Text className="absolute text-white text-lg sm:text-xl opacity-80" style={{ bottom: '32%', right: '15%' }}>*</Text>
        <Text className="absolute text-white text-lg sm:text-xl opacity-80" style={{ bottom: '27%', left: '48%' }}>*</Text>
      </View>
    </SafeAreaView>
  );
};

export default SpaceConnectScreen;
