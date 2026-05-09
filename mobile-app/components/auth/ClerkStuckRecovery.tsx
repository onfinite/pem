import { useAuth } from "@clerk/expo";
import { useEffect } from "react";

const STUCK_MS = 14_000;

type ClerkStuckRecoveryProps = {
  onStuck: () => void;
};

/**
 * If Clerk never reaches `isLoaded`, `onStuck` runs after a delay so the parent
 * can clear SecureStore and remount `ClerkProvider`. The parent should cap how
 * many times it remounts.
 */
export function ClerkStuckRecovery({ onStuck }: ClerkStuckRecoveryProps) {
  const { isLoaded } = useAuth();

  useEffect(() => {
    if (isLoaded) return;
    const id = setTimeout(() => {
      onStuck();
    }, STUCK_MS);
    return () => clearTimeout(id);
  }, [isLoaded, onStuck]);

  return null;
}
