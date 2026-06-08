import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type HolidayLocale } from "@/constants/federalHolidays";

const REGION_KEY = "@valo/holiday-region";

interface HolidayRegionContextType {
  region: HolidayLocale;
  saveRegion: (r: HolidayLocale) => Promise<void>;
}

const HolidayRegionContext = createContext<HolidayRegionContextType>({
  region: "US",
  saveRegion: async () => {},
});

export function HolidayRegionProvider({ children }: { children: React.ReactNode }) {
  const [region, setRegion] = useState<HolidayLocale>("US");

  useEffect(() => {
    AsyncStorage.getItem(REGION_KEY)
      .then((val) => {
        if (val === "US" || val === "CA" || val === "UK" || val === "AU") {
          setRegion(val);
        }
      })
      .catch(() => {});
  }, []);

  async function saveRegion(r: HolidayLocale): Promise<void> {
    setRegion(r);
    await AsyncStorage.setItem(REGION_KEY, r);
  }

  return (
    <HolidayRegionContext.Provider value={{ region, saveRegion }}>
      {children}
    </HolidayRegionContext.Provider>
  );
}

export function useHolidayRegionContext(): HolidayRegionContextType {
  return useContext(HolidayRegionContext);
}
