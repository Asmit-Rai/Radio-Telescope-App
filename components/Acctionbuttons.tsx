// components/ActionButtons.tsx
import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

const ActionButtons = ({
  onSave, onFind, onDelete, onStop, onToggleRec
}: any) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onSave} style={styles.button}><Text>SAVE</Text></TouchableOpacity>
      <TouchableOpacity onPress={onFind} style={styles.button}><Text>FIND</Text></TouchableOpacity>
      <TouchableOpacity onPress={onDelete} style={styles.button}><Text>DELETE</Text></TouchableOpacity>
      <TouchableOpacity onPress={onStop} style={styles.button}><Text>STOP</Text></TouchableOpacity>
      <TouchableOpacity onPress={onToggleRec} style={styles.button}><Text>REC/PAUSE</Text></TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', marginTop: 20 },
  button: { backgroundColor: '#fa3', padding: 10, margin: 5, borderRadius: 10 }
});

export default ActionButtons;
