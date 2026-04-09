"use client";
import React from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider, type ThemeProviderProps } from "next-themes";

// next-themes ThemeProviderProps extends React.PropsWithChildren but TS bundler
// resolution doesn't always surface the children prop — cast as workaround.
const NextThemeProvider = ThemeProvider as React.ComponentType<
  ThemeProviderProps & { children?: React.ReactNode }
>;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <NextThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        {children}
      </NextThemeProvider>
    </SessionProvider>
  );
}
