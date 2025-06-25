import React from 'react';
import { View, TouchableOpacity, Text } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import  styles  from '../utils/styles';

interface BottomBarProps {
  handleSave: () => void;
  handleFind: () => void;
  handleReset: () => void;
  handleStop: () => void;
  handlePlayPause: () => void;
  isPlaying: boolean;
}

const BottomBar: React.FC<BottomBarProps> = ({ handleSave, handleFind, handleReset, handleStop, handlePlayPause, isPlaying }) => (
  <View style={styles.bottomBar}>
    <TouchableOpacity style={styles.bottomButtonCircle} onPress={handleSave}>
      <Text style={styles.bottomButtonText}>SAVE SIGNAL</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.bottomButtonCirclePurple} onPress={handleFind}>
      <Text style={styles.bottomButtonText}>FIND SIGNAL</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.bottomButtonCircleRed} onPress={handleReset}>
      <Text style={styles.bottomButtonText}>RESET</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={handleStop}>
      <MaterialIcons name="stop-circle" size={50} color="#FF6B6B" />
    </TouchableOpacity>
    <TouchableOpacity style={styles.recPauseButton} onPress={handlePlayPause}>
      <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color="white" />
    </TouchableOpacity>
  </View>
);

export default BottomBar;