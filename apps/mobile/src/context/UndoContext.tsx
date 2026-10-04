import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "../components/AppText";

// How long the "Отменить?" banner stays before the action runs
export const UNDO_DELAY_MS = 6000;

export interface UndoableAction {
  /** What is about to happen, e.g. "Карточка будет удалена" */
  message: string;
  /** Runs when the countdown ends without "Отменить". Handles its own errors. */
  action: () => unknown;
}

interface PendingAction extends UndoableAction {
  id: number;
}

type RunUndoable = (action: UndoableAction) => void;

const UndoContext = createContext<RunUndoable>((a) => {
  void a.action();
});

/** Delays a critical action by UNDO_DELAY_MS behind a top banner the user can cancel. */
export function useUndoable(): RunUndoable {
  return useContext(UndoContext);
}

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
    setPending(null);
  }, []);

  const commit = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    dismiss();
    Promise.resolve()
      .then(p.action)
      .catch((e) => console.warn("Undoable action failed", e));
  }, [dismiss]);

  const run = useCallback<RunUndoable>(
    (action) => {
      // Only one banner at a time — a new critical action commits the previous one
      commit();
      const p = { ...action, id: ++nextId.current };
      pendingRef.current = p;
      setPending(p);
      timerRef.current = setTimeout(commit, UNDO_DELAY_MS);
    },
    [commit],
  );

  // The app may be killed in the background — don't silently lose the action
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") commit();
    });
    return () => sub.remove();
  }, [commit]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return (
    <UndoContext.Provider value={run}>
      {children}
      {pending && <UndoBanner key={pending.id} message={pending.message} onUndo={dismiss} />}
    </UndoContext.Provider>
  );
}

function UndoBanner({ message, onUndo }: { message: string; onUndo: () => void }) {
  const insets = useSafeAreaInsets();
  const appear = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.timing(progress, {
      toValue: 0,
      duration: UNDO_DELAY_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  }, [appear, progress]);

  return (
    <View pointerEvents="box-none" style={[styles.overlay, { top: insets.top + 8 }]}>
      <Animated.View
        style={[
          styles.banner,
          {
            opacity: appear,
            transform: [
              { translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) },
            ],
          },
        ]}
      >
        <View style={styles.row}>
          <View style={styles.texts}>
            <AppText style={styles.message}>{message}</AppText>
            <AppText style={styles.question}>Отменить действие?</AppText>
          </View>
          <TouchableOpacity
            style={styles.undoBtn}
            onPress={onUndo}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <AppText style={styles.undoText}>Отменить</AppText>
          </TouchableOpacity>
        </View>
        <View style={styles.track} onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}>
          <Animated.View
            style={[
              styles.bar,
              {
                transform: [
                  {
                    translateX: progress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-barWidth, 0],
                    }),
                  },
                ],
              },
            ]}
          />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 12,
    right: 12,
    zIndex: 1000,
    elevation: 1000,
  },
  banner: {
    backgroundColor: "#263238",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  texts: {
    flex: 1,
    marginRight: 12,
  },
  message: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  question: {
    color: "#B0BEC5",
    fontSize: 13,
    marginTop: 2,
  },
  undoBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(144, 202, 249, 0.15)",
  },
  undoText: {
    color: "#90CAF9",
    fontSize: 15,
    fontWeight: "700",
  },
  track: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    overflow: "hidden",
  },
  bar: {
    height: 4,
    width: "100%",
    backgroundColor: "#42A5F5",
  },
});
