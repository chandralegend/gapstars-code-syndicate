"use client"

import { useEffect } from "react"
import { create } from "zustand"

import type { BreadcrumbItem } from "@/lib/types"

export interface RunSlotData {
  /** Where the topbar's "Open feature test" link should point. */
  openTestHref?: string
}

interface BreadcrumbsState {
  items: BreadcrumbItem[]
  rightSlot: "run" | "default" | "none"
  runSlot: RunSlotData
  setItems: (items: BreadcrumbItem[]) => void
  setRightSlot: (slot: "run" | "default" | "none") => void
  setRunSlot: (data: RunSlotData) => void
}

export const useBreadcrumbsStore = create<BreadcrumbsState>((set) => ({
  items: [],
  rightSlot: "default",
  runSlot: {},
  setItems: (items) => set({ items }),
  setRightSlot: (slot) => set({ rightSlot: slot }),
  setRunSlot: (data) => set({ runSlot: data }),
}))

export function useSetBreadcrumbs(
  items: BreadcrumbItem[],
  rightSlot: "run" | "default" | "none" = "default",
  runSlot: RunSlotData = {},
) {
  useEffect(() => {
    useBreadcrumbsStore.getState().setItems(items)
    useBreadcrumbsStore.getState().setRightSlot(rightSlot)
    useBreadcrumbsStore.getState().setRunSlot(runSlot)
    return () => {
      useBreadcrumbsStore.getState().setItems([])
      useBreadcrumbsStore.getState().setRunSlot({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(items), rightSlot, JSON.stringify(runSlot)])
}
