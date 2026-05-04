import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type FontSizeOption = "small" | "medium" | "large" | "extralarge";

export const FONT_SCALES: Record<FontSizeOption, number> = {
  small: 0.85,
  medium: 1.0,
  large: 1.2,
  extralarge: 1.5,
};

const STORAGE_KEY = "@font_size";

interface ThemeContextValue {
  fontSize: FontSizeOption;
  fontScale: number;
  setFontSize: (size: FontSizeOption) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  fontSize: "medium",
  fontScale: 1.0,
  setFontSize: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSizeOption>("medium");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val === "small" || val === "medium" || val === "large" || val === "extralarge") {
        setFontSizeState(val);
      }
    });
  }, []);

  const setFontSize = (size: FontSizeOption) => {
    setFontSizeState(size);
    AsyncStorage.setItem(STORAGE_KEY, size);
  };

  return (
    <ThemeContext.Provider
      value={{ fontSize, fontScale: FONT_SCALES[fontSize], setFontSize }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
