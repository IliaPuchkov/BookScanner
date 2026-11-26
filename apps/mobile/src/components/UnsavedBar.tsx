import React from "react";
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { AppText } from "./AppText";

/**
 * Sticky bar at the bottom of a settings screen while its draft differs from what is saved —
 * visible wherever the screen is scrolled (the save button used to be only at the very end).
 */
export function UnsavedBar({
  visible,
  saving,
  onSave,
  onDiscard,
}: {
  visible: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={styles.bar}>
      <AppText style={styles.text}>Изменения не сохранены</AppText>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.discard]} onPress={onDiscard} disabled={saving} activeOpacity={0.8}>
          <AppText style={styles.discardText}>Отменить</AppText>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.save, saving && { opacity: 0.6 }]} onPress={onSave} disabled={saving} activeOpacity={0.8}>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <AppText style={styles.saveText}>Сохранить</AppText>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: "#FFF8E1",
    borderTopWidth: 1,
    borderTopColor: "#FFE082",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 14,
  },
  text: { fontSize: 13, fontWeight: "600", color: "#8D6E00", marginBottom: 8 },
  actions: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  discard: { borderWidth: 1.5, borderColor: "#ccc", backgroundColor: "#fff" },
  discardText: { fontSize: 14, fontWeight: "600", color: "#666" },
  save: { backgroundColor: "#1976D2" },
  saveText: { fontSize: 14, fontWeight: "600", color: "#fff" },
});
