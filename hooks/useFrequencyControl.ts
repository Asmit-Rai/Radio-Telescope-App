import { useState, useRef } from 'react';
import { PanResponder } from 'react-native';
import { SCREEN_WIDTH, MIN_FREQUENCY, MAX_FREQUENCY } from '../utils/constants';

export const useFrequencyControl = (
  tuneSDR: (freq: number) => Promise<void>,
  playRealTimeAudio: (data: number[], record: boolean) => Promise<void>
) => {
  const [frequency, setFrequency] = useState<number>(MIN_FREQUENCY);
  const [cursorPosition, setCursorPosition] = useState({
    x: SCREEN_WIDTH / 2,
    y: 75,
  });
  const waveformScrollRef = useRef<number>(0);

  const frequencyPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {},
    onPanResponderMove: (evt, gestureState) => {
      const sensitivity = 0.004;
      const deltaFreq = -gestureState.dx * sensitivity;
      adjustFrequency(deltaFreq);
      waveformScrollRef.current += gestureState.dx;
    },
    onPanResponderRelease: () => {
      waveformScrollRef.current = 0;
    },
  });

  const cursorPanResponder = PanResponder.create({
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {},
    onPanResponderMove: (evt, gestureState) => {
      setCursorPosition((prev) => ({
        x: Math.max(10, Math.min(SCREEN_WIDTH - 10, prev.x + gestureState.dx)),
        y: prev.y,
      }));
    },
    onPanResponderRelease: () => {},
  });

  const adjustFrequency = async (delta: number) => {
    setFrequency((prev) => {
      const newFreq = prev + delta;
      const constrainedFreq = Math.max(
        MIN_FREQUENCY,
        Math.min(MAX_FREQUENCY, parseFloat(newFreq.toFixed(3)))
      );
      tuneSDR(constrainedFreq);
      return constrainedFreq;
    });
  };

  return {
    frequency,
    cursorPosition,
    waveformScrollRef,
    adjustFrequency,
    frequencyPanResponder,
    cursorPanResponder,
  };
};
