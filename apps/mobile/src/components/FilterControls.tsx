import React from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { AppText } from "./AppText";

export function FilterTag({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <View style={tagStyles.tag}>
      <AppText style={tagStyles.label} numberOfLines={1}>
        {label}
      </AppText>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <AppText style={tagStyles.remove}>✕</AppText>
      </TouchableOpacity>
    </View>
  );
}

const tagStyles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    borderRadius: 14,
    paddingVertical: 5,
    paddingLeft: 10,
    paddingRight: 8,
    marginRight: 6,
  },
  label: {
    fontSize: 12,
    color: "#1565C0",
    maxWidth: 160,
    marginRight: 5,
  },
  remove: {
    fontSize: 10,
    color: "#1976D2",
    fontWeight: "700",
  },
});

export function FilterRow({
  label,
  value,
  onOpen,
  onClear,
}: {
  label: string;
  value?: string;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <View style={rowStyles.row}>
      <AppText style={rowStyles.label}>{label}</AppText>
      <AppText
        style={[rowStyles.value, !value && rowStyles.valuePlaceholder]}
        numberOfLines={1}
      >
        {value ?? "—"}
      </AppText>
      {value ? (
        <TouchableOpacity
          style={rowStyles.btn}
          onPress={onClear}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <AppText style={rowStyles.clearIcon}>✕</AppText>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={rowStyles.btn}
          onPress={onOpen}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <AppText style={rowStyles.plusIcon}>+</AppText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
    paddingHorizontal: 2,
  },
  label: {
    fontSize: 13,
    color: "#555",
    width: 130,
  },
  value: {
    flex: 1,
    fontSize: 13,
    color: "#1976D2",
    fontWeight: "500",
    marginRight: 4,
  },
  valuePlaceholder: {
    color: "#bbb",
    fontWeight: "400",
  },
  btn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  plusIcon: {
    fontSize: 22,
    color: "#1976D2",
    fontWeight: "300",
    lineHeight: 26,
  },
  clearIcon: {
    fontSize: 12,
    color: "#999",
    fontWeight: "700",
  },
});
