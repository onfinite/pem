import AppDrawerContent from "@/components/navigation/AppDrawerContent";
import { useTheme } from "@/contexts/ThemeContext";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";

const DRAWER_WIDTH = 300;

type AppDrawerContextValue = {
  openDrawer: () => void;
  closeDrawer: () => void;
};

const AppDrawerContext = createContext<AppDrawerContextValue | null>(null);

export function AppDrawerProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openDrawer, closeDrawer }),
    [openDrawer, closeDrawer],
  );

  return (
    <AppDrawerContext.Provider value={value}>
      {children}
      <Modal
        visible={open}
        animationType="fade"
        transparent
        onRequestClose={closeDrawer}
        statusBarTranslucent
      >
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={styles.scrim}
            onPress={closeDrawer}
          />
          <View
            style={[
              styles.panel,
              {
                width: DRAWER_WIDTH,
                backgroundColor: colors.surfacePage,
              },
            ]}
          >
            <AppDrawerContent onRequestClose={closeDrawer} />
          </View>
        </View>
      </Modal>
    </AppDrawerContext.Provider>
  );
}

export function useAppDrawer(): AppDrawerContextValue {
  const ctx = useContext(AppDrawerContext);
  if (!ctx) {
    return { openDrawer: () => {}, closeDrawer: () => {} };
  }
  return ctx;
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    flexDirection: "row",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  panel: {
    flex: 0,
    maxWidth: "88%",
    height: "100%",
    elevation: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 2, height: 0 },
  },
});
