"use client";

import { useEffect, useState } from "react";
import { isApp } from "@/lib/app/native";

/** 웹 브라우저에서만 그린다(앱 안에서는 빼는 광고 코드 등). 첫 그림 뒤에 판단한다. */
export function WebOnly({ children }: { children: React.ReactNode }) {
  const [web, setWeb] = useState(false);
  useEffect(() => setWeb(!isApp()), []);
  return web ? <>{children}</> : null;
}
