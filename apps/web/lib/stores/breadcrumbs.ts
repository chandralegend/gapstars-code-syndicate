"use client"

import { useEffect } from "react"
import { create } from "zustand"

import type { BreadcrumbItem } from "@/lib/types"

interface BreadcrumbsState {
  items: BreadcrumbItem[]
  rightSlot: "run" | "default" | "none"
  setItems: (items: BreadcrumbItem[]) => void
  setRightSlot: (slot: "run" | "default" | "none") => void
}

export const useBreadcrumbsStore = create<BreadcrumbsState>((set) => ({
  items: [],
  rightSlot: "default",
  setItems: (items) => set({ items }),
  setRightSlot: (slot) => set({ rightSlot: slot }),
}))

export function useSetBreadcrumbs(
  items: BreadcrumbItem[],
  rightSlot: "run" | "default" | "none" = "default"
) {
  useEffect(() => {
    useBreadcrumbsStore.getState().setItems(items)
    useBreadcrumbsStore.getState().setRightSlot(rightSlot)
    return () => {
      useBreadcrumbsStore.getState().setItems([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items), rightSlot])
}
