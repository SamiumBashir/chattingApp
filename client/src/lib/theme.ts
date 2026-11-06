'use client';

import { useState, useEffect, useCallback } from 'react';

export function getIsDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem('connectly_theme');
  if (stored) {
    return stored === 'dark';
  }
  return (
    document.documentElement.classList.contains('dark') ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

export function setDarkMode(enable: boolean) {
  if (typeof window === 'undefined') return;
  if (enable) {
    document.documentElement.classList.add('dark');
    localStorage.setItem('connectly_theme', 'dark');
  } else {
    document.documentElement.classList.remove('dark');
    localStorage.setItem('connectly_theme', 'light');
  }
}

export function toggleDarkMode(): boolean {
  if (typeof window === 'undefined') return false;
  const isDark = document.documentElement.classList.contains('dark');
  setDarkMode(!isDark);
  return !isDark;
}

export function useTheme() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    const isDark = getIsDarkMode();
    setIsDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggle = useCallback(() => {
    const next = toggleDarkMode();
    setIsDarkMode(next);
  }, []);

  const setMode = useCallback((dark: boolean) => {
    setDarkMode(dark);
    setIsDarkMode(dark);
  }, []);

  return { isDarkMode, toggleTheme: toggle, setDarkMode: setMode };
}
