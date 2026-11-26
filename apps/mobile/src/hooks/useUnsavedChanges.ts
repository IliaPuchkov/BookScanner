import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";

/**
 * Asks before leaving a settings screen with unsaved changes:
 * «Остаться» / «Выйти без сохранения» / «Сохранить и выйти».
 * `save` resolves true when the save went through (it shows its own errors).
 */
export function useUnsavedChangesGuard(dirty: boolean, saving: boolean, save: () => Promise<boolean>) {
  const navigation = useNavigation<any>();
  // the listener reads the latest save() without re-subscribing on every render
  const saveRef = useRef(save);
  saveRef.current = save;
  // set right before leaving on purpose: the state may not have re-rendered yet after a save
  const leavingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (e: any) => {
      if (!dirty || saving || leavingRef.current) return;
      e.preventDefault();
      Alert.alert("Изменения не сохранены", "Сохранить их перед выходом?", [
        { text: "Остаться", style: "cancel" },
        {
          text: "Выйти без сохранения",
          style: "destructive",
          onPress: () => {
            leavingRef.current = true;
            navigation.dispatch(e.data.action);
          },
        },
        {
          text: "Сохранить и выйти",
          onPress: async () => {
            if (!(await saveRef.current())) return;
            leavingRef.current = true;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsubscribe;
  }, [navigation, dirty, saving]);
}

/** «Отмена» in an editor modal: closes at once without changes, otherwise asks first. */
export function confirmDiscard(changed: boolean, discard: () => void) {
  if (!changed) {
    discard();
    return;
  }
  Alert.alert("Закрыть без применения?", "Изменения в этом окне пропадут.", [
    { text: "Остаться", style: "cancel" },
    { text: "Закрыть", style: "destructive", onPress: discard },
  ]);
}
