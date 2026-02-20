import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { Household, User } from "@couple-finance/shared";
import {
  getHousehold,
  getStoredHouseholdId,
  setStoredHouseholdId,
  clearStoredHouseholdId,
} from "../api/households";

export interface HouseholdContextValue {
  household: Household | null;
  users: User[];
  isLoading: boolean;
  selectHousehold: (id: string) => Promise<void>;
  clearHousehold: () => void;
  refreshUsers: () => Promise<void>;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function useHousehold() {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error("useHousehold must be used within HouseholdProvider");
  return ctx;
}

interface HouseholdProviderProps {
  children: ReactNode;
}

export function HouseholdProvider({ children }: HouseholdProviderProps) {
  const [household, setHousehold] = useState<Household | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadHousehold = useCallback(async (id: string) => {
    try {
      const data = await getHousehold(id);
      setHousehold(data);
      setUsers(data.users ?? []);
    } catch {
      clearStoredHouseholdId();
      setHousehold(null);
      setUsers([]);
    }
  }, []);

  const selectHousehold = useCallback(
    async (id: string) => {
      await loadHousehold(id);
      setStoredHouseholdId(id);
    },
    [loadHousehold]
  );

  const clearHousehold = useCallback(() => {
    clearStoredHouseholdId();
    setHousehold(null);
    setUsers([]);
  }, []);

  const refreshUsers = useCallback(async () => {
    if (!household) return;
    await loadHousehold(household.id);
  }, [household, loadHousehold]);

  useEffect(() => {
    const stored = getStoredHouseholdId();
    if (stored) {
      loadHousehold(stored).finally(() => setIsLoading(false));
    } else {
      setIsLoading(false);
    }
  }, [loadHousehold]);

  const value: HouseholdContextValue = {
    household,
    users,
    isLoading,
    selectHousehold,
    clearHousehold,
    refreshUsers,
  };

  return (
    <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>
  );
}
