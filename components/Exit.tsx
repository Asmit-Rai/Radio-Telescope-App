import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ImageBackground } from 'react-native';

interface ExitConfirmationModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const Exit: React.FC<ExitConfirmationModalProps> = ({
  visible,
  onConfirm,
  onCancel,
}) => {
  if (!visible) return null;

  return (
    <ImageBackground 
      source={require('../assets/background/exit1.png')}

      style={styles.overlay}
      resizeMode="cover"
    >
      <View style={styles.modal}>
        <Text style={styles.text}>Are you sure you want to quit?</Text>
        <View style={styles.actions}>
          <TouchableOpacity onPress={onConfirm}>
            <Text style={styles.exitText}>Exit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ImageBackground>
  );
};

export default Exit;

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    
    
  },
  modal: {
    width: '80%',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 2,
    borderColor: '#FF833A',
    borderStyle: 'dashed',
    borderRadius: 50,
  },
  text: {
    color: 'white',
    fontSize: 18,
    textAlign: 'center',
    fontFamily: 'Shantell',
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
  },
  exitText: {
    color: 'red',
    fontSize: 16,
    fontFamily: 'Shantell',
  },
  cancelText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Shantell',
  },
});